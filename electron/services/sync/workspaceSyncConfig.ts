import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\w.-]+$/u)

const gitBindingSchema = z
  .object({
    provider: z.literal('git'),
    remote: identifierSchema,
    branch: z.string().trim().min(1).max(255).optional(),
    autoFetch: z.boolean(),
  })
  .strict()

const webDavBindingSchema = z
  .object({
    provider: z.literal('webdav'),
    profileId: identifierSchema,
    remoteRoot: z.string().trim().min(1).max(2048),
    autoSync: z.boolean(),
  })
  .strict()

export const workspaceSyncBindingSchema = z.discriminatedUnion('provider', [
  gitBindingSchema,
  webDavBindingSchema,
])

export type WorkspaceSyncBinding = z.infer<typeof workspaceSyncBindingSchema>

export type WorkspaceSyncBindingRecord = {
  workspacePath: string
  binding: WorkspaceSyncBinding
}

const storedRecordSchema = z
  .object({
    workspacePath: z.string().min(1),
    binding: workspaceSyncBindingSchema,
  })
  .strict()

const storedFileSchema = z
  .object({
    version: z.literal(1),
    deviceId: z.string().uuid().optional(),
    workspaces: z.array(storedRecordSchema),
  })
  .strict()

type StoredFile = z.infer<typeof storedFileSchema>

export class WorkspaceSyncConfigStore {
  private readonly filePath: string
  private tail: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    if (!path.isAbsolute(userDataPath)) {
      throw new Error('Workspace sync userData path must be absolute')
    }
    this.filePath = path.join(path.resolve(userDataPath), 'sync', 'workspace-bindings.json')
  }

  get(workspacePath: string): Promise<WorkspaceSyncBinding | null> {
    return this.serialized(async () => {
      const canonical = canonicalWorkspacePath(workspacePath)
      const record = (await this.readFile()).workspaces.find(
        (candidate) => workspaceKey(candidate.workspacePath) === workspaceKey(canonical),
      )
      return record ? cloneBinding(record.binding) : null
    })
  }

  list(): Promise<WorkspaceSyncBindingRecord[]> {
    return this.serialized(async () =>
      (await this.readFile()).workspaces.map((record) => ({
        workspacePath: record.workspacePath,
        binding: cloneBinding(record.binding),
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

  set(workspacePath: string, value: WorkspaceSyncBinding): Promise<WorkspaceSyncBinding> {
    return this.serialized(async () => {
      const canonical = canonicalWorkspacePath(workspacePath)
      const binding = parseBinding(value)
      const data = await this.readFile()
      const key = workspaceKey(canonical)
      data.workspaces = [
        ...data.workspaces.filter((record) => workspaceKey(record.workspacePath) !== key),
        { workspacePath: canonical, binding },
      ].sort((left, right) => left.workspacePath.localeCompare(right.workspacePath))
      await this.writeFile(data)
      return cloneBinding(binding)
    })
  }

  remove(workspacePath: string): Promise<{ ok: true }> {
    return this.serialized(async () => {
      const key = workspaceKey(canonicalWorkspacePath(workspacePath))
      const data = await this.readFile()
      data.workspaces = data.workspaces.filter(
        (record) => workspaceKey(record.workspacePath) !== key,
      )
      await this.writeFile(data)
      return { ok: true }
    })
  }

  private async readFile(): Promise<StoredFile> {
    try {
      return storedFileSchema.parse(JSON.parse(await fs.readFile(this.filePath, 'utf8')))
    } catch (error) {
      if (isMissing(error)) return { version: 1, workspaces: [] }
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

const parseBinding = (value: WorkspaceSyncBinding): WorkspaceSyncBinding => {
  const binding = workspaceSyncBindingSchema.parse(value)
  if (binding.provider === 'webdav') validateRemoteRoot(binding.remoteRoot)
  if (binding.provider === 'git') rejectControlCharacters(binding.branch ?? binding.remote)
  return binding
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

const cloneBinding = (binding: WorkspaceSyncBinding): WorkspaceSyncBinding => ({ ...binding })

const isMissing = (error: unknown): boolean =>
  Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
