import type {
  DesktopCommandArgs,
  DesktopCommandResults,
  DesktopEventPayloads,
} from '@/generated/desktop/bindings'

export type WebDavProfile = DesktopCommandResults['webdav_profile_list'][number]
export type WebDavProfileInput = DesktopCommandArgs['webdav_profile_update']['request']
export type WorkspaceSyncChannels = DesktopCommandResults['sync_channels_get']
export type WebDavWorkspaceSyncChannel = NonNullable<WorkspaceSyncChannels['webdav']>
export type WorkspaceSyncChannel = WebDavWorkspaceSyncChannel
export type WorkspaceSyncProgressEvent = DesktopEventPayloads['sync-progress']
export type WorkspaceSyncProgress = WorkspaceSyncProgressEvent['progress']
export type WorkspaceSyncConflictList = DesktopCommandResults['sync_conflicts_list']
export type WorkspaceSyncConflict = WorkspaceSyncConflictList['conflicts'][number]
export type WorkspaceSyncStartOutcome = DesktopCommandResults['sync_start']
export type WorkspaceSyncResult = Extract<
  WorkspaceSyncStartOutcome,
  { status: 'completed' }
>['result']
export type WorkspaceSyncBindingIdentity = NonNullable<WorkspaceSyncConflictList['binding']>
export type WorkspaceSyncConflictRequest = DesktopCommandArgs['sync_conflicts_read']['request']
export type WorkspaceSyncConflictComparison = DesktopCommandResults['sync_conflicts_read']
export type WorkspaceSyncConflictVersion = WorkspaceSyncConflictComparison['local']
export type WorkspaceSyncConflictResolution =
  DesktopCommandArgs['sync_conflicts_resolve']['request']
