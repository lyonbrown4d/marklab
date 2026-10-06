import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { registerEditCommandsIpc } from '@electron/ipc/editCommands'

describe('focused edit command IPC', () => {
  it.each(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const)(
    'executes the allowlisted %s command on the requesting web contents',
    async (action) => {
      const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
      registerEditCommandsIpc({
        handle: (channel, handler) => handlers.set(channel, handler as never),
      })
      const sender = {
        undo: vi.fn(),
        redo: vi.fn(),
        cut: vi.fn(),
        copy: vi.fn(),
        paste: vi.fn(),
        selectAll: vi.fn(),
      }

      await expect(
        handlers.get(nativeIpcChannels.editCommand)?.({ sender }, { action }),
      ).resolves.toEqual({ ok: true })
      expect(sender[action]).toHaveBeenCalledOnce()
    },
  )

  it('rejects unknown commands before accessing web contents', async () => {
    const handlers = new Map<string, (event: unknown, payload: unknown) => unknown>()
    registerEditCommandsIpc({
      handle: (channel, handler) => handlers.set(channel, handler as never),
    })
    const sender = { copy: vi.fn() }

    await expect(
      Promise.resolve().then(() =>
        handlers.get(nativeIpcChannels.editCommand)?.({ sender }, { action: 'executeJavaScript' }),
      ),
    ).rejects.toThrow()
    expect(sender.copy).not.toHaveBeenCalled()
  })
})
