import { describe, expect, it } from 'vitest'

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
})
