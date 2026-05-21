import type { IpcMain, Shell } from 'electron'

import { nativeIpcChannels } from '../channels.js'
import { validateExistingLocalPath } from '../services/pathValidation.js'
import type { ShellPathResult } from '../types.js'

export function registerShellIpc(ipcMain: IpcMain, shell: Shell): void {
  ipcMain.handle(nativeIpcChannels.shellRevealPath, (_event, value: unknown): ShellPathResult => {
    const validated = validateExistingLocalPath(value)
    if (!validated.ok) return validated

    shell.showItemInFolder(validated.path)
    return { ok: true, path: validated.path }
  })

  ipcMain.handle(
    nativeIpcChannels.shellOpenPath,
    async (_event, value: unknown): Promise<ShellPathResult> => {
      const validated = validateExistingLocalPath(value)
      if (!validated.ok) return validated

      const error = await shell.openPath(validated.path)
      if (error) {
        return { ok: false, path: validated.path, error }
      }

      return { ok: true, path: validated.path }
    },
  )
}
