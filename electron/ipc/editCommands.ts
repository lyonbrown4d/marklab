import type { IpcMain } from 'electron'
import { z } from 'zod'

import { nativeIpcChannels } from '@electron/channels'
import { focusedEditActions, type FocusedEditAction } from '@/types/editCommand'

const editCommandSchema = z.object({ action: z.enum(focusedEditActions) }).strict()

export const registerEditCommandsIpc = (ipcMain: Pick<IpcMain, 'handle'>): void => {
  ipcMain.handle(nativeIpcChannels.editCommand, async (event, payload: unknown) => {
    const { action } = editCommandSchema.parse(payload)
    runWebContentsEditCommand(event.sender, action)
    return { ok: true as const }
  })
}

const runWebContentsEditCommand = (
  sender: Pick<Electron.WebContents, FocusedEditAction>,
  action: FocusedEditAction,
): void => {
  sender[action]()
}
