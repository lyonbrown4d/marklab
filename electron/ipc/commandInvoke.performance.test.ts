import type { IpcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { registerCommandInvokeIpc } from '@electron/ipc/commandInvoke'
import type { Logger } from '@electron/services/logger'

const createHarness = () => {
  let invokeHandler:
    | ((event: Electron.IpcMainInvokeEvent, payload: unknown, args: unknown) => Promise<unknown>)
    | undefined
  const ipcMain = {
    handle: vi.fn((_channel, handler) => {
      invokeHandler = handler
    }),
  } as unknown as IpcMain
  const logger = {
    child: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger & { info: ReturnType<typeof vi.fn> }
  return {
    invoke: (command: string) =>
      invokeHandler?.({} as Electron.IpcMainInvokeEvent, { command }, undefined),
    ipcMain,
    logger,
  }
}

describe('command invoke performance logging', () => {
  it('leaves instrumented window opening to its phase-specific log', async () => {
    const { invoke, ipcMain, logger } = createHarness()
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(600)
    registerCommandInvokeIpc(
      ipcMain,
      { open_path_in_new_window: vi.fn(async () => ({ ok: true })) },
      logger,
    )

    await invoke('open_path_in_new_window')

    expect(logger.info).not.toHaveBeenCalledWith('slow command invoke completed', expect.anything())
    now.mockRestore()
  })

  it('keeps the generic slow log for commands without dedicated timings', async () => {
    const { invoke, ipcMain, logger } = createHarness()
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(600)
    registerCommandInvokeIpc(ipcMain, { fs_get_workspace_graph: vi.fn(async () => ({})) }, logger)

    await invoke('fs_get_workspace_graph')

    expect(logger.info).toHaveBeenCalledWith('slow command invoke completed', {
      command: 'fs_get_workspace_graph',
      durationMs: 600,
    })
    now.mockRestore()
  })
})
