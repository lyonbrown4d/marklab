import type { IpcMain, Shell } from 'electron'
import { nativeIpcChannels } from '@electron/channels.js'
import {
  getUserThemesDir,
  importUserThemeCss,
  listUserThemes,
  readUserThemeCss,
  removeUserTheme,
} from '@electron/services/userThemeStore.js'
import type {
  SettingsPersistResult,
  UserThemeCssResult,
  UserThemeImportResult,
  UserThemeListResult,
} from '@electron/types.js'

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Theme operation failed.'

export const registerThemeIpc = (ipcMain: IpcMain, shell: Shell): void => {
  ipcMain.handle(nativeIpcChannels.themeList, (): UserThemeListResult => {
    try {
      return { ok: true, themes: listUserThemes() }
    } catch (error) {
      return { ok: false, error: errorMessage(error), themes: [] }
    }
  })

  ipcMain.handle(
    nativeIpcChannels.themeImportCss,
    (_event, sourcePath: unknown): UserThemeImportResult => {
      try {
        if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
          throw new Error('Theme import requires a CSS file path.')
        }
        return { ok: true, theme: importUserThemeCss(sourcePath) }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    },
  )

  ipcMain.handle(nativeIpcChannels.themeReadCss, (_event, id: unknown): UserThemeCssResult => {
    try {
      if (typeof id !== 'string' || !id.trim()) return { ok: true, css: '' }
      return { ok: true, css: readUserThemeCss(id) }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })

  ipcMain.handle(
    nativeIpcChannels.themeRemove,
    async (_event, id: unknown): Promise<SettingsPersistResult> => {
      try {
        if (typeof id !== 'string' || !id.trim()) throw new Error('Theme remove requires an id.')
        await removeUserTheme(id)
        return { ok: true }
      } catch (error) {
        return { ok: false, error: errorMessage(error) }
      }
    },
  )

  ipcMain.handle(nativeIpcChannels.themeOpenFolder, async (): Promise<SettingsPersistResult> => {
    try {
      const error = await shell.openPath(getUserThemesDir())
      return error ? { ok: false, error } : { ok: true }
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }
  })
}
