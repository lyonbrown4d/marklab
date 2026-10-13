import type * as Electron from 'electron'
import { nativeIpcChannels } from '@electron/channels'
import type { OpenDialogOptions, SaveDialogOptions } from '@electron/types'
import {
  createWorkspaceDirectory,
  validateWorkspaceName,
} from '@electron/ipc/createWorkspaceDirectory'
import { issueSavePathCapability } from '@electron/ipc/savePathCapabilities'
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
  ipcMain.handle(
    nativeIpcChannels.dialogCreateWorkspace,
    async (event, options: { name: string; title?: string }) => {
      if (
        !event.senderFrame ||
        event.senderFrame !== event.sender.mainFrame ||
        event.sender.isDestroyed()
      ) {
        throw new Error('Workspace creation requires the main workspace frame')
      }
      const parent = BrowserWindowCtor.fromWebContents(event.sender)
      if (!parent || parent.isDestroyed())
        throw new Error('Workspace creation requires an active window')
      const name = validateWorkspaceName(options?.name)
      const dialogOptions: Electron.OpenDialogOptions = {
        title: typeof options.title === 'string' ? options.title : undefined,
        properties: ['openDirectory'],
      }
      const result = await dialog.showOpenDialog(parent, dialogOptions)
      if (result.canceled || !result.filePaths[0]) return null
      if (parent.isDestroyed() || event.sender.isDestroyed())
        throw new Error('Workspace window closed before creation')
      return createWorkspaceDirectory(result.filePaths[0], name)
    },
  )
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
    if (!result.filePath) return null
    await issueSavePathCapability(event.sender.id, result.filePath)
    return result.filePath
  })
}
