import { describe, expect, it, vi } from 'vitest'

import { WorkspaceGraphPrecomputeCoordinator } from '@electron/services/workspace/workspaceGraphPrecomputeCoordinator'

const createHarness = () => {
  const logger = { warn: vi.fn() }
  const run = vi.fn(async () => undefined)
  const setStatus = vi.fn()
  const coordinator = new WorkspaceGraphPrecomputeCoordinator({
    delayMs: 50,
    logger,
    run,
    setStatus,
  })
  return { coordinator, logger, run, setStatus }
}

describe('WorkspaceGraphPrecomputeCoordinator', () => {
  it('debounces repeated requests and reports background task progress', async () => {
    vi.useFakeTimers()
    const { coordinator, run, setStatus } = createHarness()

    coordinator.schedule()
    coordinator.schedule()
    await vi.advanceTimersByTimeAsync(49)
    expect(run).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(run).toHaveBeenCalledOnce()
    expect(setStatus).toHaveBeenNthCalledWith(1, 'running', null)
    expect(setStatus).toHaveBeenNthCalledWith(2, 'idle', null)
    coordinator.dispose()
    vi.useRealTimers()
  })

  it('cancels pending work when the workspace changes or the service is disposed', async () => {
    vi.useFakeTimers()
    const { coordinator, run } = createHarness()

    coordinator.schedule()
    coordinator.cancel()
    await vi.runAllTimersAsync()
    coordinator.schedule()
    coordinator.dispose()
    await vi.runAllTimersAsync()

    expect(run).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('captures failures without rejecting an unobserved background promise', async () => {
    vi.useFakeTimers()
    const { coordinator, logger, run, setStatus } = createHarness()
    const error = new Error('graph build failed')
    run.mockRejectedValueOnce(error)

    coordinator.schedule()
    await vi.runAllTimersAsync()

    expect(logger.warn).toHaveBeenCalledWith('workspace graph precompute failed', { error })
    expect(setStatus).toHaveBeenLastCalledWith('error', 'graph build failed')
    coordinator.dispose()
    vi.useRealTimers()
  })

  it('keeps a cancelled running task visible until the computation settles', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const run = vi.fn(
      ({ markStarted }: { markStarted: () => void; signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          markStarted()
          release = resolve
        }),
    )
    const setStatus = vi.fn()
    const coordinator = new WorkspaceGraphPrecomputeCoordinator({
      delayMs: 0,
      logger: { warn: vi.fn() },
      run,
      setStatus,
    })

    coordinator.schedule()
    await vi.advanceTimersByTimeAsync(0)
    coordinator.cancel()

    expect(setStatus).toHaveBeenLastCalledWith('running', null)
    release()
    await vi.runAllTimersAsync()
    expect(setStatus).toHaveBeenLastCalledWith('idle', null)
    coordinator.dispose()
    vi.useRealTimers()
  })

  it('does not let an obsolete running generation overwrite a newer generation', async () => {
    vi.useFakeTimers()
    const releases: Array<() => void> = []
    const run = vi.fn(
      ({ markStarted }: { markStarted: () => void; signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          markStarted()
          releases.push(resolve)
        }),
    )
    const setStatus = vi.fn()
    const coordinator = new WorkspaceGraphPrecomputeCoordinator({
      delayMs: 0,
      logger: { warn: vi.fn() },
      run,
      setStatus,
    })

    coordinator.schedule()
    await vi.advanceTimersByTimeAsync(0)
    coordinator.cancel()
    coordinator.schedule()
    await vi.advanceTimersByTimeAsync(0)
    releases.shift()?.()
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2))

    expect(setStatus).toHaveBeenLastCalledWith('running', null)
    releases.shift()?.()
    await vi.runAllTimersAsync()
    expect(setStatus).toHaveBeenLastCalledWith('idle', null)
    coordinator.dispose()
    vi.useRealTimers()
  })
})
