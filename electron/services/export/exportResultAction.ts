import type { BrowserWindow, Shell } from 'electron'

export const revealFinishedExport = (
  BrowserWindowClass: typeof BrowserWindow,
  shell: Shell,
  outputPath: string,
  ownerId?: number,
): void => {
  const ownerWindow = BrowserWindowClass.getAllWindows().find(
    (window) => ownerId === undefined || window.webContents.id === ownerId,
  )
  if (ownerWindow && !ownerWindow.isDestroyed()) {
    if (ownerWindow.isMinimized()) ownerWindow.restore()
    ownerWindow.show()
    ownerWindow.focus()
  }
  shell.showItemInFolder(outputPath)
}
