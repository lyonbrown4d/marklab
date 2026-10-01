import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createMarkdownSnapshotScheduler,
  scheduleRendererIdleSnapshot,
} from '@/components/milkdown/markdownSnapshotScheduler'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createMarkdownSnapshotScheduler', () => {
  it('serializes only the latest document when the renderer becomes idle', () => {
    let scheduled: (() => void) | null = null
    const cancel = vi.fn()
    const serialize = vi.fn((document: { markdown: string }) => document.markdown)
    const commit = vi.fn()
    const scheduler = createMarkdownSnapshotScheduler({
      commit,
      schedule: (callback) => {
        scheduled = callback
        return cancel
      },
      serialize,
    })

    scheduler.update({ markdown: 'one' })
    scheduler.update({ markdown: 'two' })
    scheduler.update({ markdown: 'three' })

    expect(serialize).not.toHaveBeenCalled()
    expect(commit).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledTimes(2)
    ;(scheduled as (() => void) | null)?.()
    expect(serialize).toHaveBeenCalledTimes(1)
    expect(commit).toHaveBeenCalledWith('three')
  })

  it('flushes the latest pending document synchronously at a durability boundary', () => {
    const cancel = vi.fn()
    const serialize = vi.fn((document: { markdown: string }) => document.markdown)
    const commit = vi.fn()
    const scheduler = createMarkdownSnapshotScheduler({
      commit,
      schedule: () => cancel,
      serialize,
    })

    scheduler.update({ markdown: 'latest' })
    scheduler.flush()

    expect(cancel).toHaveBeenCalledTimes(1)
    expect(serialize).toHaveBeenCalledWith({ markdown: 'latest' })
    expect(commit).toHaveBeenCalledWith('latest')
  })

  it('falls back to a timer when Electron never runs its idle callback', () => {
    vi.useFakeTimers()
    const callback = vi.fn()
    const cancelIdleCallback = vi.fn()
    const requestIdleCallback = vi.fn(() => 17)
    vi.stubGlobal('requestIdleCallback', requestIdleCallback)
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback)

    scheduleRendererIdleSnapshot(callback)
    vi.advanceTimersByTime(500)

    expect(callback).toHaveBeenCalledOnce()
    expect(cancelIdleCallback).toHaveBeenCalledWith(17)
  })
})
