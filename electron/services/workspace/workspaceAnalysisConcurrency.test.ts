import { describe, expect, it, vi } from 'vitest'
import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'

describe('workspace analysis concurrency', () => {
  it('caps CPU-heavy work across callers at three concurrent tasks', async () => {
    let active = 0
    let peak = 0
    const releases: Array<() => void> = []
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active += 1
          peak = Math.max(peak, active)
          releases.push(() => {
            active -= 1
            resolve()
          })
        }),
    )

    const scheduler = new WorkspaceAnalysisScheduler({ concurrency: 3 })
    const operations = Array.from({ length: 4 }, () => scheduler.run(task))
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(3))
    expect(scheduler.running).toBe(3)
    expect(scheduler.pending).toBe(1)
    releases.shift()?.()
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(4))
    releases.splice(0).forEach((release) => release())
    await Promise.all(operations)

    expect(peak).toBe(3)
  })

  it('shares one concurrency budget with graph computations', async () => {
    let active = 0
    let peak = 0
    const releases: Array<() => void> = []
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          active += 1
          peak = Math.max(peak, active)
          releases.push(() => {
            active -= 1
            resolve()
          })
        }),
    )
    const scheduler = new WorkspaceAnalysisScheduler({ concurrency: 3 })
    const graphScheduler = new WorkspaceGraphComputationScheduler({ scheduler })

    const direct = [scheduler.run(task), scheduler.run(task)]
    const graph = ['graph-a', 'graph-b'].map((workspaceKey) =>
      graphScheduler.run({ priority: 'interactive', revision: 'r1', task, workspaceKey }),
    )

    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(3))
    expect(peak).toBe(3)
    releases.shift()?.()
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(4))
    releases.splice(0).forEach((release) => release())
    await Promise.all([...direct, ...graph])
    expect(peak).toBe(3)
  })

  it('rejects work beyond the configured pending bound', async () => {
    let release!: () => void
    const scheduler = new WorkspaceAnalysisScheduler({ concurrency: 1, maxPending: 1 })
    const active = scheduler.run(() => new Promise<void>((resolve) => (release = resolve)))
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const queued = scheduler.run(async () => undefined)

    await expect(scheduler.run(async () => undefined)).rejects.toThrow(/queue is full/i)
    release()
    await Promise.all([active, queued])
  })

  it('executes nested work within the current scheduler slot', async () => {
    const scheduler = new WorkspaceAnalysisScheduler({ concurrency: 1 })

    await expect(scheduler.run(() => scheduler.run(async () => 'nested'))).resolves.toBe('nested')
    expect(scheduler.running).toBe(0)
  })
})
