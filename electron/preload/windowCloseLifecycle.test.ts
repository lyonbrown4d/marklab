import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels.js'
import { createWindowCloseLifecyclePreloadSurface } from '@electron/preload/windowCloseLifecycle.js'

describe('window close lifecycle preload surface', () => {
  it('acknowledges only after the renderer flush handler settles', async () => {
    const ipcRenderer = Object.assign(new EventEmitter(), { send: vi.fn() })
    let finish!: () => void
    const surface = createWindowCloseLifecyclePreloadSurface(ipcRenderer as never)
    surface.onCloseRequested(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )

    ipcRenderer.emit(nativeIpcChannels.windowCloseFlushRequest, {}, { requestId: 4 })
    await Promise.resolve()
    expect(ipcRenderer.send).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() =>
      expect(ipcRenderer.send).toHaveBeenCalledWith(nativeIpcChannels.windowCloseFlushReady, {
        ok: true,
        requestId: 4,
      }),
    )
  })

  it('reports renderer flush failures and removes the listener', async () => {
    const ipcRenderer = Object.assign(new EventEmitter(), {
      removeListener: vi.fn(EventEmitter.prototype.removeListener),
      send: vi.fn(),
    })
    const surface = createWindowCloseLifecyclePreloadSurface(ipcRenderer as never)
    const dispose = surface.onCloseRequested(async () => {
      throw new Error('Buffer write failed')
    })

    ipcRenderer.emit(nativeIpcChannels.windowCloseFlushRequest, {}, { requestId: 5 })
    await vi.waitFor(() =>
      expect(ipcRenderer.send).toHaveBeenCalledWith(nativeIpcChannels.windowCloseFlushReady, {
        error: 'Buffer write failed',
        ok: false,
        requestId: 5,
      }),
    )
    dispose()
    expect(ipcRenderer.removeListener).toHaveBeenCalled()
  })
})
