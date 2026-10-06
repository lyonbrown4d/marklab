import type { BrowserWindow, IpcMain } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { registerWindowCloseLifecycleIpc } from '@electron/ipc/windowCloseLifecycle'

const createHarness = () => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  const ipcMain = {
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, listener)
    }),
  } as unknown as IpcMain
  const webContents = { id: 9, send: vi.fn() }
  const window = {
    isDestroyed: () => false,
    webContents,
  } as unknown as BrowserWindow
  const bridge = registerWindowCloseLifecycleIpc(ipcMain)
  return { bridge, listeners, webContents, window }
}

describe('window close lifecycle IPC', () => {
  it('waits for the matching renderer flush acknowledgement', async () => {
    const { bridge, listeners, webContents, window } = createHarness()
    const pending = bridge.requestRendererFlush(window)
    const request = webContents.send.mock.calls[0]?.[1] as { requestId: number }
    let settled = false
    void pending.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    listeners.get(nativeIpcChannels.windowCloseFlushReady)?.(
      { sender: webContents },
      { ok: true, requestId: request.requestId },
    )

    await expect(pending).resolves.toBeUndefined()
  })

  it('rejects the close when renderer persistence fails', async () => {
    const { bridge, listeners, webContents, window } = createHarness()
    const pending = bridge.requestRendererFlush(window)
    const request = webContents.send.mock.calls[0]?.[1] as { requestId: number }

    listeners.get(nativeIpcChannels.windowCloseFlushReady)?.(
      { sender: webContents },
      { error: 'Snapshot failed', ok: false, requestId: request.requestId },
    )

    await expect(pending).rejects.toThrow('Snapshot failed')
  })
})
