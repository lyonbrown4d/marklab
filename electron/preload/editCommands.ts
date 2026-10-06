import type { IpcRenderer } from 'electron'
import { z } from 'zod'

import { nativeIpcChannels } from '@electron/channels'
import type { FocusedEditAction } from '@/types/editCommand'

const resultSchema = z.object({ ok: z.literal(true) }).strict()

export const createEditCommandsPreloadSurface = (ipcRenderer: Pick<IpcRenderer, 'invoke'>) => ({
  execute: async (action: FocusedEditAction): Promise<{ ok: true }> =>
    resultSchema.parse(await ipcRenderer.invoke(nativeIpcChannels.editCommand, { action })),
})
