import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { createWindowPresentationPreloadSurface } from '@electron/preload/windowPresentation'

describe('native window presentation preload', () => {
  it('waits for presentation and exposes no IPC payload to subscribers', () => {
    const ipc = new EventEmitter()
    const surface = createWindowPresentationPreloadSurface(ipc as never)
    const handler = vi.fn()
    surface.onPresented(handler)
    expect(handler).not.toHaveBeenCalled()
    ipc.emit(nativeIpcChannels.windowPresented, {}, { unexpected: 'ignored' })
    expect(handler).toHaveBeenCalledExactlyOnceWith()
  })

  it('replays presentation received before React is mounted', () => {
    const ipc = new EventEmitter()
    const surface = createWindowPresentationPreloadSurface(ipc as never)
    ipc.emit(nativeIpcChannels.windowPresented, {})
    const first = vi.fn()
    const second = vi.fn()
    surface.onPresented(first)
    surface.onPresented(second)
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()
  })

  it('unsubscribes without interfering with other subscribers', () => {
    const ipc = new EventEmitter()
    const surface = createWindowPresentationPreloadSurface(ipc as never)
    const first = vi.fn()
    const second = vi.fn()
    const stop = surface.onPresented(first)
    surface.onPresented(second)
    stop()
    ipc.emit(nativeIpcChannels.windowPresented, {})
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })
})
