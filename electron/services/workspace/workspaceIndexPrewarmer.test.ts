import { describe, expect, it, vi } from 'vitest'

import { WorkspaceIndexPrewarmer } from '@electron/services/workspace/workspaceIndexPrewarmer'

describe('WorkspaceIndexPrewarmer', () => {
  it('aborts scheduled work that has not started', async () => {
    vi.useFakeTimers()
    let scheduledSignal: AbortSignal | undefined
    const schedule = vi.fn((_task, signal: AbortSignal) => {
      scheduledSignal = signal
      return new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(new DOMException('This operation was aborted', 'AbortError')),
          { once: true },
        )
      })
    })
    const run = vi.fn(async () => undefined)
    const prewarmer = new WorkspaceIndexPrewarmer({
      delayMs: 0,
      logger: { warn: vi.fn() },
      run,
      schedule,
    })

    prewarmer.schedule()
    await vi.advanceTimersByTimeAsync(0)
    prewarmer.cancel()
    await vi.runAllTimersAsync()

    expect(scheduledSignal?.aborted).toBe(true)
    expect(run).not.toHaveBeenCalled()
    prewarmer.dispose()
    vi.useRealTimers()
  })

  it('does not abort work after it has started', async () => {
    vi.useFakeTimers()
    let release!: () => void
    let runningSignal: AbortSignal | undefined
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )
    const prewarmer = new WorkspaceIndexPrewarmer({
      delayMs: 0,
      logger: { warn: vi.fn() },
      run,
      schedule: async (task, signal) => {
        runningSignal = signal
        return task()
      },
    })

    prewarmer.schedule()
    await vi.advanceTimersByTimeAsync(0)
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce())
    prewarmer.cancel()

    expect(runningSignal?.aborted).toBe(false)
    release()
    await vi.runAllTimersAsync()
    prewarmer.dispose()
    vi.useRealTimers()
  })
})
