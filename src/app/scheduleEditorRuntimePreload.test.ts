import { afterEach, describe, expect, it, vi } from 'vitest'
import { scheduleEditorRuntimePreload } from '@/app/scheduleEditorRuntimePreload'

describe('scheduleEditorRuntimePreload', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('preloads the editor runtime only after the browser becomes idle', async () => {
    let idleCallback: IdleRequestCallback | undefined
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idleCallback = callback
        return 1
      }),
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    const preload = vi.fn(() => Promise.resolve())

    scheduleEditorRuntimePreload(preload)
    expect(preload).not.toHaveBeenCalled()
    idleCallback?.({ didTimeout: false, timeRemaining: () => 16 })
    await Promise.resolve()

    expect(preload).toHaveBeenCalledWith(1)
  })

  it('preloads only one worker and does not schedule additional idle preloads', async () => {
    vi.useFakeTimers()
    const idleCallbacks: IdleRequestCallback[] = []
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn((callback: IdleRequestCallback) => {
        idleCallbacks.push(callback)
        return idleCallbacks.length
      }),
    )
    vi.stubGlobal('cancelIdleCallback', vi.fn())
    const preload = vi.fn(() => Promise.resolve())

    scheduleEditorRuntimePreload(preload)
    idleCallbacks[0]?.({ didTimeout: false, timeRemaining: () => 16 })
    await Promise.resolve()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10_000)

    expect(preload).toHaveBeenCalledOnce()
    expect(preload).toHaveBeenCalledWith(1)
    expect(idleCallbacks).toHaveLength(1)
  })

  it('cancels an idle preload that is no longer needed', () => {
    vi.stubGlobal(
      'requestIdleCallback',
      vi.fn(() => 7),
    )
    const cancelIdleCallback = vi.fn()
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback)

    const cancel = scheduleEditorRuntimePreload(vi.fn())
    cancel()

    expect(cancelIdleCallback).toHaveBeenCalledWith(7)
  })
})
