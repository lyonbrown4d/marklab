import type * as Electron from 'electron'
import { nativeIpcChannels } from '../channels.js'
import type { OpenDialogOptions, SaveDialogOptions } from '../types.js'
const openProperties = (
  options: OpenDialogOptions,
): Array<'openFile' | 'openDirectory' | 'multiSelections'> => {
  const properties: Array<'openFile' | 'openDirectory' | 'multiSelections'> = []
  const wantsDirectory = options.directory === true
  const wantsFile = options.file === true || (!wantsDirectory && options.file !== false)
  if (wantsDirectory) {
    properties.push('openDirectory')
  }
  if (wantsFile || properties.length === 0) {
    properties.push('openFile')
  }
  if (options.multiple) {
    properties.push('multiSelections')
  }
  return properties
}
export const registerDialogIpc = (
  ipcMain: Electron.IpcMain,
  dialog: Electron.Dialog,
  BrowserWindowCtor: typeof Electron.BrowserWindow,
): void => {
  ipcMain.handle(nativeIpcChannels.dialogOpen, async (event, options: OpenDialogOptions = {}) => {
    const parent = BrowserWindowCtor.fromWebContents(event.sender) ?? undefined
    const dialogOptions = {
      title: options.title,
      defaultPath: options.defaultPath,
      buttonLabel: options.buttonLabel,
      filters: options.filters,
      properties: openProperties(options),
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)
    if (result.canceled) return null
    return options.multiple ? result.filePaths : (result.filePaths[0] ?? null)
  })
  ipcMain.handle(nativeIpcChannels.dialogSave, async (event, options: SaveDialogOptions = {}) => {
    const parent = BrowserWindowCtor.fromWebContents(event.sender) ?? undefined
    const dialogOptions = {
      title: options.title,
      defaultPath: options.defaultPath,
      buttonLabel: options.buttonLabel,
      filters: options.filters,
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)
    if (result.canceled) return null
    return result.filePath ?? null
  })
}
