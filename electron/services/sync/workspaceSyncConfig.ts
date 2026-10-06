import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import type { LocalDatabaseService } from '@electron/database/localDatabaseService'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import { WorkspaceRepository } from '@electron/database/repositories/workspaceRepository'
import { WorkspaceSyncChannelRepository } from '@electron/database/repositories/workspaceSyncChannelRepository'
import { DATABASE_SETTING_KEYS } from '@electron/database/schema'
import { canonicalWorkspacePath } from '@electron/services/workspace/workspaceIdentity'
import type { WorkspaceSyncChannel, WorkspaceSyncChannels } from '@/types/workspaceSync'

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[\w.-]+$/u)
export const workspaceSyncChannelSchema = z
  .object({
    provider: z.literal('webdav'),
    profileId: identifierSchema,
    remoteRoot: z.string().trim().min(1).max(2048),
    autoSync: z.boolean(),
  })
  .strict()

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
      return channelsFromRow(this.channels.findForWorkspace(this.localDatabase, workspace.id))
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
    return snapshot.channels.map((row) => {
      const workspacePath = workspacePaths.get(row.workspace_id)
      if (!workspacePath) throw new Error('Workspace sync channel has no workspace')
      return { workspacePath, channels: channelsFromRow(row) }
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
      return channelsFromRow(this.channels.findForWorkspace(this.localDatabase, workspaceId))
    })()
  }

  async removeChannel(workspacePath: string): Promise<WorkspaceSyncChannels> {
    const canonical = canonicalWorkspacePath(workspacePath)
    await this.localDatabase.initialize()
    return this.localDatabase.sqlite.transaction(() => {
      const workspace = this.workspaces.findByCanonicalPath(this.localDatabase, canonical)
      if (!workspace) return emptyChannels()
      this.channels.remove(this.localDatabase, workspace.id)
      return emptyChannels()
    })()
  }
}

type ChannelRow = ReturnType<WorkspaceSyncChannelRepository['findForWorkspace']>

const channelValues = (workspaceId: number, channel: WorkspaceSyncChannel) => ({
  workspace_id: workspaceId,
  profile_id: channel.profileId,
  remote_root: channel.remoteRoot,
  auto_sync: booleanInteger(channel.autoSync),
})

const channelsFromRow = (row: ChannelRow): WorkspaceSyncChannels => ({
  webdav: row
    ? {
        provider: 'webdav',
        profileId: row.profile_id,
        remoteRoot: row.remote_root,
        autoSync: Boolean(row.auto_sync),
      }
    : null,
})

const parseChannel = (value: WorkspaceSyncChannel): WorkspaceSyncChannel => {
  const channel = workspaceSyncChannelSchema.parse(value)
  validateRemoteRoot(channel.remoteRoot)
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
const emptyChannels = (): WorkspaceSyncChannels => ({ webdav: null })

const parseDeviceId = (valueJson: string): string => {
  try {
    return z.uuid().parse(JSON.parse(valueJson))
  } catch (error) {
    throw new Error('Workspace sync device identity could not be read', { cause: error })
  }
}
