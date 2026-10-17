import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventHub } from '@/runtime/tauri/transport'
import { createWindowApis } from '@/runtime/tauri/window'

const native = vi.hoisted(() => ({ current: undefined as unknown, warn: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native.current }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))

const windowFixture = (initial: boolean) => {
  const handlers = new Set<() => void>()
  const stop = vi.fn()
  const window = {
    isMaximized: vi.fn<() => Promise<boolean>>().mockResolvedValue(initial),
    onResized: vi.fn(async (handler: () => void) => {
      handlers.add(handler)
      return () => {
        stop()
        handlers.delete(handler)
      }
    }),
  }
  native.current = window
  return {
    window,
    stop,
    resize: () => {
      for (const handler of handlers) handler()
    },
  }
}
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('current-window maximized subscriptions', () => {
  it('reads restored state, deduplicates resize events, and isolates another root', async () => {
    const first = windowFixture(true)
    const firstApi = createWindowApis(createEventHub())
    const second = windowFixture(false)
    const secondApi = createWindowApis(createEventHub())
    const receiveFirst = vi.fn()
    const receiveSecond = vi.fn()
    const stopFirst = await firstApi.window.onMaximizedChanged(receiveFirst)
    const stopSecond = await secondApi.window.onMaximizedChanged(receiveSecond)
    expect(receiveFirst).toHaveBeenCalledExactlyOnceWith(true)
    expect(receiveSecond).toHaveBeenCalledExactlyOnceWith(false)
    first.window.isMaximized.mockResolvedValue(false)
    first.resize()
    await vi.waitFor(() => expect(receiveFirst).toHaveBeenLastCalledWith(false))
    first.resize()
    await Promise.resolve()
    expect(receiveFirst).toHaveBeenCalledTimes(2)
    expect(receiveSecond).toHaveBeenCalledOnce()
    stopFirst()
    first.resize()
    expect(first.stop).toHaveBeenCalledOnce()
    stopSecond()
    firstApi.dispose()
    secondApi.dispose()
    expect(second.stop).toHaveBeenCalledOnce()
  })

  it('does not let an older native query overwrite a newer resize result', async () => {
    const fixture = windowFixture(false)
    const api = createWindowApis(createEventHub())
    const receive = vi.fn()
    await api.window.onMaximizedChanged(receive)
    let old: (value: boolean) => void = () => undefined
    fixture.window.isMaximized.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          old = resolve
        }),
    )
    fixture.resize()
    fixture.window.isMaximized.mockResolvedValue(true)
    fixture.resize()
    await vi.waitFor(() => expect(receive).toHaveBeenLastCalledWith(true))
    old(false)
    await Promise.resolve()
    expect(receive.mock.calls).toEqual([[false], [true]])
    api.dispose()
  })

  it('suppresses pending results and unsubscribes when the runtime owner is disposed', async () => {
    const fixture = windowFixture(false)
    const api = createWindowApis(createEventHub())
    const receive = vi.fn()
    let complete: (value: boolean) => void = () => undefined
    fixture.window.isMaximized.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          complete = resolve
        }),
    )
    const installing = api.window.onMaximizedChanged(receive)
    await Promise.resolve()
    api.dispose()
    complete(true)
    const stop = await installing
    stop()
    expect(receive).not.toHaveBeenCalled()
    expect(fixture.stop).toHaveBeenCalledOnce()
    await api.window.onMaximizedChanged(receive)
    expect(fixture.window.onResized).toHaveBeenCalledOnce()
  })

  it('cleans up a failed initial read and allows a subsequent subscription', async () => {
    const fixture = windowFixture(false)
    const api = createWindowApis(createEventHub())
    fixture.window.isMaximized.mockRejectedValueOnce(new Error('Window state unavailable'))
    await expect(api.window.onMaximizedChanged(vi.fn())).rejects.toThrow('Window state unavailable')
    expect(fixture.stop).toHaveBeenCalledOnce()
    const receive = vi.fn()
    await api.window.onMaximizedChanged(receive)
    expect(receive).toHaveBeenCalledExactlyOnceWith(false)
    fixture.window.isMaximized.mockRejectedValueOnce(new Error('Resize state unavailable'))
    fixture.resize()
    await vi.waitFor(() =>
      expect(native.warn).toHaveBeenCalledWith(
        'window.state',
        'maximized-read-failed',
        expect.any(Error),
      ),
    )
    expect(receive).toHaveBeenCalledOnce()
    api.dispose()
  })
})
