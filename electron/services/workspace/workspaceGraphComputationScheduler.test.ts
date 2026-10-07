import { describe, expect, it, vi } from 'vitest'

import { WorkspaceGraphComputationScheduler } from '@electron/services/workspace/workspaceGraphComputationScheduler'

describe('WorkspaceGraphComputationScheduler', () => {
  it('limits graph computation across workspaces while allowing parallel utility processes', async () => {
    const scheduler = new WorkspaceGraphComputationScheduler({ concurrency: 2 })
    let active = 0
    let maximumActive = 0
    const releases: Array<() => void> = []
    const task = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          active += 1
          maximumActive = Math.max(maximumActive, active)
          releases.push(() => {
            active -= 1
            resolve('done')
          })
        }),
    )

    const results = ['a', 'b', 'c'].map((workspaceKey) =>
      scheduler.run({ priority: 'background', revision: 'r1', task, workspaceKey }),
    )
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2))
    releases.splice(0).forEach((release) => release())
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(3))
    releases.splice(0).forEach((release) => release())

    await expect(Promise.all(results)).resolves.toEqual(['done', 'done', 'done'])
    expect(maximumActive).toBe(2)
  })

  it('shares one computation for the same workspace revision', async () => {
    const scheduler = new WorkspaceGraphComputationScheduler({ concurrency: 3 })
    const task = vi.fn(async () => ({ graph: true }))

    const first = scheduler.run({
      priority: 'background',
      revision: 'r1',
      task,
      workspaceKey: 'external:C:/notes',
    })
    const second = scheduler.run({
      priority: 'interactive',
      revision: 'r1',
      task,
      workspaceKey: 'external:C:/notes',
    })

    await expect(Promise.all([first, second])).resolves.toEqual([{ graph: true }, { graph: true }])
    expect(task).toHaveBeenCalledOnce()
  })

  it('marks only the newest revision as current for persistence', async () => {
    const scheduler = new WorkspaceGraphComputationScheduler({ concurrency: 1 })
    const workspaceKey = 'external:C:/notes'
    let release!: () => void
    const first = scheduler.run({
      priority: 'background',
      revision: 'r1',
      task: () => new Promise<void>((resolve) => (release = resolve)),
      workspaceKey,
    })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const second = scheduler.run({
      priority: 'background',
      revision: 'r2',
      task: async () => undefined,
      workspaceKey,
    })

    expect(scheduler.isCurrent(workspaceKey, 'r1')).toBe(false)
    expect(scheduler.isCurrent(workspaceKey, 'r2')).toBe(true)
    release()
    await Promise.all([first, second])
  })

  it('promotes a queued background computation when an interactive request joins it', async () => {
    const scheduler = new WorkspaceGraphComputationScheduler({ concurrency: 1 })
    let release!: () => void
    const order: string[] = []
    const blocker = scheduler.run({
      priority: 'background',
      revision: 'r1',
      task: () => new Promise<void>((resolve) => (release = resolve)),
      workspaceKey: 'blocker',
    })
    await vi.waitFor(() => expect(release).toBeTypeOf('function'))
    const ordinary = scheduler.run({
      priority: 'background',
      revision: 'r1',
      task: async () => void order.push('ordinary'),
      workspaceKey: 'ordinary',
    })
    const promoted = scheduler.run({
      priority: 'background',
      revision: 'r1',
      task: async () => void order.push('promoted'),
      workspaceKey: 'promoted',
    })
    const joined = scheduler.run({
      priority: 'interactive',
      revision: 'r1',
      task: async () => undefined,
      workspaceKey: 'promoted',
    })

    release()
    await Promise.all([blocker, ordinary, promoted, joined])
    expect(order).toEqual(['promoted', 'ordinary'])
  })
})
