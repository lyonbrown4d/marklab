import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { createWindowOpeningPreloadSurface } from '@electron/preload/windowOpening'

describe('window opening preload surface', () => {
  it('replays progress received before the renderer subscribes', () => {
    const ipcRenderer = Object.assign(new EventEmitter(), { invoke: vi.fn() })
    const surface = createWindowOpeningPreloadSurface(ipcRenderer as never)

    ipcRenderer.emit(
      nativeIpcChannels.windowOpeningProgress,
      {},
      { stage: 'indexing', workspacePath: 'C:\\notes' },
    )
    const handler = vi.fn()
    surface.onProgress(handler)

    expect(handler).toHaveBeenCalledWith({ stage: 'indexing', workspacePath: 'C:\\notes' })
  })

  it('delivers validated progress and removes its listener', () => {
    const ipcRenderer = Object.assign(new EventEmitter(), {
      invoke: vi.fn(),
      removeListener: vi.fn(EventEmitter.prototype.removeListener),
    })
    const surface = createWindowOpeningPreloadSurface(ipcRenderer as never)
    const handler = vi.fn()
    const unsubscribe = surface.onProgress(handler)

    ipcRenderer.emit(
      nativeIpcChannels.windowOpeningProgress,
      {},
      {
        stage: 'loading',
        workspacePath: 'C:\\notes',
      },
    )
    ipcRenderer.emit(nativeIpcChannels.windowOpeningProgress, {}, { stage: 'unknown' })
    unsubscribe()

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ stage: 'loading', workspacePath: 'C:\\notes' })
    expect(ipcRenderer.removeListener).toHaveBeenCalled()
  })

  it('invokes the retry command through the narrow opening API', async () => {
    const ipcRenderer = Object.assign(new EventEmitter(), {
      invoke: vi.fn(async () => ({ ok: true })),
    })
    const surface = createWindowOpeningPreloadSurface(ipcRenderer as never)

    await expect(surface.retry()).resolves.toEqual({ ok: true })
    expect(ipcRenderer.invoke).toHaveBeenCalledWith(nativeIpcChannels.commandInvoke, {
      command: 'retry_window_open',
    })
  })
})
