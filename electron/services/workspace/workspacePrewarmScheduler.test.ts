import { describe, expect, it, vi } from 'vitest'

import { scheduleWorkspacePrewarm } from '@electron/services/workspace/workspacePrewarmScheduler'

describe('workspace prewarm scheduler', () => {
  it('serializes tree and index prewarms across windows', async () => {
    let running = 0
    let maximum = 0
    let releaseFirst!: () => void
    const first = scheduleWorkspacePrewarm(
      () =>
        new Promise<void>((resolve) => {
          running += 1
          maximum = Math.max(maximum, running)
          releaseFirst = () => {
            running -= 1
            resolve()
          }
        }),
    )
    const second = scheduleWorkspacePrewarm(async () => {
      running += 1
      maximum = Math.max(maximum, running)
      running -= 1
    })

    await Promise.resolve()
    releaseFirst()
    await Promise.all([first, second])

    expect(maximum).toBe(1)
  })

  it('removes an aborted prewarm before it starts', async () => {
    let release!: () => void
    const blocker = scheduleWorkspacePrewarm(
      () => new Promise<void>((resolve) => (release = resolve)),
    )
    await Promise.resolve()
    const task = vi.fn(async () => undefined)
    const controller = new AbortController()
    const queued = scheduleWorkspacePrewarm(task, controller.signal)

    controller.abort()
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' })
    release()
    await blocker
    expect(task).not.toHaveBeenCalled()
  })
})
