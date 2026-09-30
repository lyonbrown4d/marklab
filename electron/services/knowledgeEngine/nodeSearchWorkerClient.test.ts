import { describe, expect, it, vi } from 'vitest'

import { NodeSearchWorkerScheduler } from '@electron/services/knowledgeEngine/nodeSearchWorkerClient.js'

describe('NodeSearchWorkerScheduler', () => {
  it('never runs more builds than its process-wide parallelism cap', async () => {
    const scheduler = new NodeSearchWorkerScheduler(2)
    const controller = new AbortController()
    let active = 0
    let maximumActive = 0
    const releases: Array<() => void> = []
    const task = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise<void>((resolve) => releases.push(resolve))
      active -= 1
    })
    const builds = Array.from({ length: 4 }, () => scheduler.run(task, controller.signal))
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2))

    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(4))
    releases.splice(0).forEach((release) => release())
    await Promise.all(builds)

    expect(maximumActive).toBe(2)
  })

  it('removes an aborted build while it waits for a worker slot', async () => {
    const scheduler = new NodeSearchWorkerScheduler(1)
    const runningController = new AbortController()
    let releaseRunning!: () => void
    const running = scheduler.run(
      () => new Promise<void>((resolve) => (releaseRunning = resolve)),
      runningController.signal,
    )
    const queuedController = new AbortController()
    const queuedTask = vi.fn(async () => undefined)
    const queued = scheduler.run(queuedTask, queuedController.signal)

    queuedController.abort()

    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    releaseRunning()
    await running
    expect(queuedTask).not.toHaveBeenCalled()
  })
})
