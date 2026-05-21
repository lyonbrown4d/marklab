import type { IpcMain } from 'electron'
import { nativeIpcChannels } from '../channels.js'
import {
  getRendererPersistValue,
  removeRendererPersistValue,
  setRendererPersistValue,
} from '../services/settingsStore.js'
import type { SettingsPersistResult } from '../types.js'
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
export const registerSettingsIpc = (ipcMain: IpcMain): void => {
  ipcMain.handle(nativeIpcChannels.settingsPersistGet, (_event, key: string) =>
    getRendererPersistValue(key),
  )
  ipcMain.handle(nativeIpcChannels.settingsPersistSet, (_event, key: string, value: unknown) =>
    toSettingsPersistResult(() => {
      setRendererPersistValue(key, value)
    }),
  )
  ipcMain.handle(nativeIpcChannels.settingsPersistRemove, (_event, key: string) =>
    toSettingsPersistResult(() => {
      removeRendererPersistValue(key)
    }),
  )
}
