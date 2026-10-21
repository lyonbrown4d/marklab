import type { DesktopCommandResults, DesktopEventPayloads } from '@/generated/desktop/bindings'

export type DesktopUpdateState = DesktopCommandResults['updates_get_state']
export type DesktopUpdateStatus = DesktopUpdateState['status']
export type DesktopUpdateInfo = NonNullable<DesktopUpdateState['info']>
export type DesktopUpdateProgress = NonNullable<DesktopUpdateState['progress']>
export type DesktopUpdateError = NonNullable<DesktopUpdateState['error']>
export type DesktopUpdateResult = DesktopCommandResults['updates_check']
export type DesktopUpdateEvent = DesktopEventPayloads['updates-event']
