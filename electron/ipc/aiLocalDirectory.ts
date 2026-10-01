import type * as Electron from 'electron'

export type LocalAiDirectoryPicker = (
  event: Electron.IpcMainInvokeEvent,
  defaultPath: string,
) => Promise<string | null>

export const createLocalAiDirectoryPicker = (
  dialog: Electron.Dialog,
  BrowserWindowCtor: typeof Electron.BrowserWindow,
): LocalAiDirectoryPicker => {
  return async (event, defaultPath) => {
    const parent = BrowserWindowCtor.fromWebContents(event.sender) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: 'Choose local AI model directory',
      buttonLabel: 'Choose folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  }
}
