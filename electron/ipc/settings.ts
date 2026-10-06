import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import {
  getRendererPersistValue,
  removeRendererPersistValue,
  setRendererPersistValue,
} from '@electron/services/settingsStore'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'
import type { SettingsPersistResult } from '@electron/types'

const toSettingsPersistResult = (action: () => void): SettingsPersistResult => {
  try {
    action()
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Settings operation failed.',
    }
  }
}

const sessionKeyForEvent = (
  event: IpcMainInvokeEvent,
  workspaceRegistry: WindowWorkspaceRegistry,
): string => {
  return workspaceRegistry.sessionKeyForWebContents(event.sender)
}

export const registerSettingsIpc = (
  ipcMain: IpcMain,
  workspaceRegistry: WindowWorkspaceRegistry,
): void => {
  ipcMain.handle(nativeIpcChannels.settingsPersistGet, (event, key: string) =>
    getRendererPersistValue(key, sessionKeyForEvent(event, workspaceRegistry)),
  )
  ipcMain.handle(nativeIpcChannels.settingsPersistSet, (event, key: string, value: unknown) =>
    toSettingsPersistResult(() => {
      setRendererPersistValue(key, value, sessionKeyForEvent(event, workspaceRegistry))
    }),
  )
  ipcMain.handle(nativeIpcChannels.settingsPersistRemove, (event, key: string) =>
    toSettingsPersistResult(() => {
      removeRendererPersistValue(key, sessionKeyForEvent(event, workspaceRegistry))
    }),
  )
}
