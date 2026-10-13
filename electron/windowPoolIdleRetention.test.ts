import type { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createWindowPoolIdleRetention } from '@electron/windowPoolIdleRetention'

describe('standby window retention', () => {
  afterEach(() => vi.useRealTimers())
  it('refreshes a retained window expiry and cancels windows independently', () => {
    vi.useFakeTimers()
    const first = {} as BrowserWindow
    const second = {} as BrowserWindow
    const discard = vi.fn()
    const retention = createWindowPoolIdleRetention(discard, 100)
    retention.retain(first)
    retention.retain(second)
    vi.advanceTimersByTime(50)
    retention.retain(first)
    retention.cancel(second)
    retention.cancel(second)
    vi.advanceTimersByTime(50)
    expect(discard).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(discard).toHaveBeenCalledExactlyOnceWith(first)
    expect(vi.getTimerCount()).toBe(0)
  })
})
