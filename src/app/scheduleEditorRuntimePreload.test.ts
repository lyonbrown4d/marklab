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

  it('staggers three workers across separate idle periods', async () => {
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
    expect(preload).toHaveBeenLastCalledWith(1)

    await vi.advanceTimersByTimeAsync(750)
    idleCallbacks[1]?.({ didTimeout: false, timeRemaining: () => 16 })
    await Promise.resolve()
    await Promise.resolve()
    expect(preload).toHaveBeenLastCalledWith(2)

    await vi.advanceTimersByTimeAsync(750)
    idleCallbacks[2]?.({ didTimeout: false, timeRemaining: () => 16 })
    await Promise.resolve()
    expect(preload).toHaveBeenLastCalledWith(3)
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
