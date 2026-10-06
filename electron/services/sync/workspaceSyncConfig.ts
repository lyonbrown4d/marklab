import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import type { LocalDatabaseService } from '@electron/database/localDatabaseService'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import { WorkspaceRepository } from '@electron/database/repositories/workspaceRepository'
import { WorkspaceSyncChannelRepository } from '@electron/database/repositories/workspaceSyncChannelRepository'
import { DATABASE_SETTING_KEYS } from '@electron/database/schema'
import { validateBranchName, validateRemoteName } from '@electron/services/git/validation'
import { canonicalWorkspacePath } from '@electron/services/workspace/workspaceIdentity'
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

export class WorkspaceSyncConfigStore {
  private readonly channels = new WorkspaceSyncChannelRepository()
  private readonly settings: SettingsRepository
  private readonly workspaces = new WorkspaceRepository()

  constructor(private readonly localDatabase: LocalDatabaseService) {
    this.settings = new SettingsRepository(localDatabase)
  }

  async getChannels(workspacePath: string): Promise<WorkspaceSyncChannels> {
    const canonical = canonicalWorkspacePath(workspacePath)
    await this.localDatabase.initialize()
    return this.localDatabase.sqlite.transaction(() => {
      const workspace = this.workspaces.findByCanonicalPath(this.localDatabase, canonical)
      if (!workspace) return emptyChannels()
      return channelsFromRows(this.channels.listForWorkspace(this.localDatabase, workspace.id))
    })()
  }

  async listChannels(): Promise<WorkspaceSyncChannelsRecord[]> {
    await this.localDatabase.initialize()
    const snapshot = this.localDatabase.sqlite.transaction(() => ({
      channels: this.channels.listAll(this.localDatabase),
      workspaces: this.workspaces.list(this.localDatabase),
    }))()
    const workspacePaths = new Map(
      snapshot.workspaces.map((workspace) => [workspace.id, workspace.path]),
    )
    const records = new Map<number, WorkspaceSyncChannels>()
    for (const row of snapshot.channels) {
      const channels = records.get(row.workspace_id) ?? emptyChannels()
      assignChannel(channels, row)
      records.set(row.workspace_id, channels)
    }
    return [...records].map(([workspaceId, channels]) => {
      const workspacePath = workspacePaths.get(workspaceId)
      if (!workspacePath) throw new Error('Workspace sync channel has no workspace')
      return { workspacePath, channels }
    })
  }

  async getOrCreateDeviceId(): Promise<string> {
    await this.localDatabase.initialize()
    return this.localDatabase.sqlite.transaction(() => {
      const current = this.settings.get(DATABASE_SETTING_KEYS.syncDeviceId)
      if (current) return parseDeviceId(current.value_json)
      const deviceId = randomUUID()
      this.settings.upsert(DATABASE_SETTING_KEYS.syncDeviceId, JSON.stringify(deviceId), null)
      const stored = this.settings.get(DATABASE_SETTING_KEYS.syncDeviceId)
      if (!stored) throw new Error('Workspace sync device identity could not be created')
      return parseDeviceId(stored.value_json)
    })()
  }

  async setChannel(
    workspacePath: string,
    value: WorkspaceSyncChannel,
  ): Promise<WorkspaceSyncChannels> {
    const canonical = canonicalWorkspacePath(workspacePath)
    const channel = parseChannel(value)
    await this.localDatabase.initialize()
    return this.localDatabase.sqlite.transaction(() => {
      const workspaceId = this.workspaces.findOrCreate(this.localDatabase, canonical, canonical)
      this.channels.upsert(this.localDatabase, channelValues(workspaceId, channel))
      return channelsFromRows(this.channels.listForWorkspace(this.localDatabase, workspaceId))
    })()
  }

  async removeChannel(
    workspacePath: string,
    provider: WorkspaceSyncProvider,
  ): Promise<WorkspaceSyncChannels> {
    const canonical = canonicalWorkspacePath(workspacePath)
    await this.localDatabase.initialize()
    return this.localDatabase.sqlite.transaction(() => {
      const workspace = this.workspaces.findByCanonicalPath(this.localDatabase, canonical)
      if (!workspace) return emptyChannels()
      this.channels.remove(this.localDatabase, workspace.id, provider)
      return channelsFromRows(this.channels.listForWorkspace(this.localDatabase, workspace.id))
    })()
  }
}

type ChannelRow = Awaited<ReturnType<WorkspaceSyncChannelRepository['listForWorkspace']>>[number]

const channelValues = (workspaceId: number, channel: WorkspaceSyncChannel) =>
  channel.provider === 'git'
    ? {
        workspace_id: workspaceId,
        provider: channel.provider,
        remote: channel.remote,
        branch: channel.branch ?? null,
        auto_fetch: booleanInteger(channel.autoFetch),
        profile_id: null,
        remote_root: null,
        auto_sync: null,
      }
    : {
        workspace_id: workspaceId,
        provider: channel.provider,
        remote: null,
        branch: null,
        auto_fetch: null,
        profile_id: channel.profileId,
        remote_root: channel.remoteRoot,
        auto_sync: booleanInteger(channel.autoSync),
      }

const channelsFromRows = (rows: ChannelRow[]): WorkspaceSyncChannels => {
  const channels = emptyChannels()
  rows.forEach((row) => assignChannel(channels, row))
  return channels
}

const assignChannel = (channels: WorkspaceSyncChannels, row: ChannelRow): void => {
  if (row.provider === 'git' && row.remote && row.auto_fetch !== null) {
    channels.git = {
      provider: 'git',
      remote: row.remote,
      ...(row.branch ? { branch: row.branch } : {}),
      autoFetch: Boolean(row.auto_fetch),
    }
  }
  if (row.provider === 'webdav' && row.profile_id && row.remote_root && row.auto_sync !== null) {
    channels.webdav = {
      provider: 'webdav',
      profileId: row.profile_id,
      remoteRoot: row.remote_root,
      autoSync: Boolean(row.auto_sync),
    }
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
  if (value.split('/').some((segment) => segment === '..' || segment === '.')) {
    throw new Error('WebDAV remote root cannot escape its configured directory')
  }
}

const rejectControlCharacters = (value: string): void => {
  if (value.includes('\0') || value.includes('\r') || value.includes('\n')) {
    throw new Error('Workspace sync value contains invalid control characters')
  }
}

const booleanInteger = (value: boolean): 0 | 1 => (value ? 1 : 0)
const emptyChannels = (): WorkspaceSyncChannels => ({ git: null, webdav: null })

const parseDeviceId = (valueJson: string): string => {
  try {
    return z.string().uuid().parse(JSON.parse(valueJson))
  } catch (error) {
    throw new Error('Workspace sync device identity could not be read', { cause: error })
  }
}
