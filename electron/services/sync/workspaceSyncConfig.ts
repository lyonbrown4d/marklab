import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'
import { validateBranchName, validateRemoteName } from '@electron/services/git/validation.js'
import type {
  WorkspaceSyncChannel,
  WorkspaceSyncChannels,
  WorkspaceSyncProvider,
} from '@/types/workspaceSync'

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\w.-]+$/u)

const gitChannelSchema = z
  .object({
    provider: z.literal('git'),
    remote: identifierSchema,
    branch: z.string().trim().min(1).max(255).optional(),
    autoFetch: z.boolean(),
  })
  .strict()

const webDavChannelSchema = z
  .object({
    provider: z.literal('webdav'),
    profileId: identifierSchema,
    remoteRoot: z.string().trim().min(1).max(2048),
    autoSync: z.boolean(),
  })
  .strict()

export const workspaceSyncChannelSchema = z.discriminatedUnion('provider', [
  gitChannelSchema,
  webDavChannelSchema,
])

export type WorkspaceSyncChannelsRecord = {
  workspacePath: string
  channels: WorkspaceSyncChannels
}

const storedRecordSchema = z
  .object({
    workspacePath: z.string().min(1),
    channels: z
      .object({
        git: gitChannelSchema.optional(),
        webdav: webDavChannelSchema.optional(),
      })
      .strict(),
  })
  .strict()

const storedFileSchema = z
  .object({
    version: z.literal(2),
    deviceId: z.string().uuid().optional(),
    workspaces: z.array(storedRecordSchema),
  })
  .strict()

type StoredFile = z.infer<typeof storedFileSchema>
type StoredChannels = StoredFile['workspaces'][number]['channels']

export class WorkspaceSyncConfigStore {
  private readonly filePath: string
  private tail: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    if (!path.isAbsolute(userDataPath)) {
      throw new Error('Workspace sync userData path must be absolute')
    }
    this.filePath = path.join(path.resolve(userDataPath), 'sync', 'workspace-bindings.json')
  }

  getChannels(workspacePath: string): Promise<WorkspaceSyncChannels> {
    return this.serialized(async () => {
      return channelsFor(await this.readFile(), workspacePath)
    })
  }

  listChannels(): Promise<WorkspaceSyncChannelsRecord[]> {
    return this.serialized(async () =>
      (await this.readFile()).workspaces.map((record) => ({
        workspacePath: record.workspacePath,
        channels: publicChannels(record.channels),
      })),
    )
  }

  getOrCreateDeviceId(): Promise<string> {
    return this.serialized(async () => {
      const data = await this.readFile()
      if (data.deviceId) return data.deviceId
      data.deviceId = randomUUID()
      await this.writeFile(data)
      return data.deviceId
    })
  }

  setChannel(workspacePath: string, value: WorkspaceSyncChannel): Promise<WorkspaceSyncChannels> {
    return this.serialized(async () => {
      const canonical = canonicalWorkspacePath(workspacePath)
      const channel = parseChannel(value)
      const data = await this.readFile()
      const key = workspaceKey(canonical)
      const existing = data.workspaces.find((record) => workspaceKey(record.workspacePath) === key)
      const channels = { ...existing?.channels, [channel.provider]: channel }
      data.workspaces = [
        ...data.workspaces.filter((record) => workspaceKey(record.workspacePath) !== key),
        { workspacePath: canonical, channels },
      ].sort((left, right) => left.workspacePath.localeCompare(right.workspacePath))
      await this.writeFile(data)
      return publicChannels(channels)
    })
  }

  removeChannel(
    workspacePath: string,
    provider: WorkspaceSyncProvider,
  ): Promise<WorkspaceSyncChannels> {
    return this.serialized(async () => {
      const canonical = canonicalWorkspacePath(workspacePath)
      const key = workspaceKey(canonical)
      const data = await this.readFile()
      const existing = data.workspaces.find((record) => workspaceKey(record.workspacePath) === key)
      if (!existing) return emptyChannels()
      const channels = { ...existing.channels }
      delete channels[provider]
      data.workspaces = data.workspaces.filter(
        (record) => workspaceKey(record.workspacePath) !== key,
      )
      if (channels.git || channels.webdav) {
        data.workspaces.push({ workspacePath: canonical, channels })
        data.workspaces.sort((left, right) => left.workspacePath.localeCompare(right.workspacePath))
      }
      await this.writeFile(data)
      return publicChannels(channels)
    })
  }

  private async readFile(): Promise<StoredFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.filePath, 'utf8'))
      assertSupportedVersion(parsed)
      return storedFileSchema.parse(parsed)
    } catch (error) {
      if (isMissing(error)) return { version: 2, workspaces: [] }
      if (error instanceof UnsupportedSyncConfigVersionError) throw error
      throw new Error('Workspace sync configuration could not be read', { cause: error })
    }
  }

  private async writeFile(data: StoredFile): Promise<void> {
    const directory = path.dirname(this.filePath)
    await fs.mkdir(directory, { recursive: true })
    const temporary = `${this.filePath}.tmp-${randomUUID()}`
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), {
        encoding: 'utf8',
        flag: 'wx',
      })
      await fs.rename(temporary, this.filePath)
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  private serialized<T>(work: () => Promise<T>): Promise<T> {
    const run = this.tail.then(work, work)
    this.tail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }
}

const parseChannel = (value: WorkspaceSyncChannel): WorkspaceSyncChannel => {
  const channel = workspaceSyncChannelSchema.parse(value)
  if (channel.provider === 'webdav') validateRemoteRoot(channel.remoteRoot)
  if (channel.provider === 'git') {
    validateRemoteName(channel.remote)
    if (channel.branch) validateBranchName(channel.branch)
  }
  return channel
}

const validateRemoteRoot = (value: string): void => {
  rejectControlCharacters(value)
  if (!value.startsWith('/')) throw new Error('WebDAV remote root must be absolute')
  const segments = value.split('/')
  if (segments.some((segment) => segment === '..' || segment === '.')) {
    throw new Error('WebDAV remote root cannot escape its configured directory')
  }
}

const rejectControlCharacters = (value: string): void => {
  if (value.includes('\0') || value.includes('\r') || value.includes('\n')) {
    throw new Error('Workspace sync value contains invalid control characters')
  }
}

const canonicalWorkspacePath = (value: string): string => {
  if (!path.isAbsolute(value)) throw new Error('Workspace sync path must be absolute')
  return path.resolve(value)
}

const workspaceKey = (value: string): string =>
  process.platform === 'win32' ? value.toLocaleLowerCase('en-US') : value

const emptyChannels = (): WorkspaceSyncChannels => ({ git: null, webdav: null })

const publicChannels = (channels: StoredChannels): WorkspaceSyncChannels => ({
  git: channels.git ? { ...channels.git } : null,
  webdav: channels.webdav ? { ...channels.webdav } : null,
})

const channelsFor = (data: StoredFile, workspacePath: string): WorkspaceSyncChannels => {
  const canonical = canonicalWorkspacePath(workspacePath)
  const record = data.workspaces.find(
    (candidate) => workspaceKey(candidate.workspacePath) === workspaceKey(canonical),
  )
  return record ? publicChannels(record.channels) : emptyChannels()
}

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')

class UnsupportedSyncConfigVersionError extends Error {
  constructor() {
    super('Unsupported workspace sync configuration version')
    this.name = 'UnsupportedSyncConfigVersionError'
  }
}

const assertSupportedVersion = (value: unknown): void => {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 2) {
    throw new UnsupportedSyncConfigVersionError()
  }
}
