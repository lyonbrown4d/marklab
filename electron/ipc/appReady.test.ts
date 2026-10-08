import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { registerAppReadyIpc } from '@electron/ipc/appReady'

describe('registerAppReadyIpc', () => {
  it('forwards the sender and validated renderer phase', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(channel, handler)
      }),
    }
    const onRendererReady = vi.fn()
    registerAppReadyIpc(
      ipcMain as never,
      { isReady: () => true, whenReady: vi.fn(async () => undefined) } as never,
      onRendererReady,
    )
    const event = { sender: { id: 42 } } as IpcMainInvokeEvent

    const result = handlers.get(nativeIpcChannels.appReadySignal)?.(event, {
      phase: 'workspace-interactive',
    })

    expect(result).toEqual({ ok: true })
    expect(onRendererReady).toHaveBeenCalledWith(event, { phase: 'workspace-interactive' })
  })

  it('rejects unknown readiness phases', () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const ipcMain = {
      handle: (_channel: string, handler: (...args: unknown[]) => unknown) => {
        handlers.set(_channel, handler)
      },
    }
    registerAppReadyIpc(ipcMain as never, {} as never, vi.fn())

    expect(() =>
      handlers.get(nativeIpcChannels.appReadySignal)?.({ sender: {} }, { phase: 'unknown' }),
    ).toThrow('Unsupported renderer ready phase')
  })
})
