import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { WorkspaceSyncCoordinator } from '@electron/services/sync/core/coordinator.js'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}

describe('WorkspaceSyncCoordinator', () => {
  it('reuses one active sync for canonical aliases of the same workspace', async () => {
    const coordinator = new WorkspaceSyncCoordinator()
    const gate = deferred<string>()
    const work = vi.fn(() => gate.promise)
    const root = path.resolve('workspace-a')

    const first = coordinator.runSync(root, work)
    const second = coordinator.runSync(path.join(root, 'notes', '..'), work)

    expect(second).toBe(first)
    await vi.waitFor(() => expect(work).toHaveBeenCalledOnce())
    gate.resolve('done')
    await expect(first).resolves.toBe('done')
  })

  it('serializes mutations per workspace while allowing different workspaces concurrently', async () => {
    const coordinator = new WorkspaceSyncCoordinator()
    const firstGate = deferred<void>()
    const order: string[] = []
    const first = coordinator.runMutation('workspace-a', async () => {
      order.push('a1-start')
      await firstGate.promise
      order.push('a1-end')
    })
    const second = coordinator.runMutation('workspace-a', async () => order.push('a2'))
    const other = coordinator.runMutation('workspace-b', async () => order.push('b1'))

    await vi.waitFor(() => expect(order).toContain('b1'))
    expect(order).not.toContain('a2')
    firstGate.resolve()
    await Promise.all([first, second, other])
    expect(order).toEqual(['a1-start', 'b1', 'a1-end', 'a2'])
  })

  it('lets a waiting caller abort without cancelling the shared sync', async () => {
    const coordinator = new WorkspaceSyncCoordinator()
    const gate = deferred<string>()
    const shared = coordinator.runSync('workspace-a', () => gate.promise)
    const controller = new AbortController()
    const waiting = coordinator.runSync('workspace-a', () => Promise.resolve('other'), {
      signal: controller.signal,
    })

    controller.abort()
    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    gate.resolve('done')
    await expect(shared).resolves.toBe('done')
  })

  it('explicitly cancels the active workspace sync', async () => {
    const coordinator = new WorkspaceSyncCoordinator()
    const started = deferred<void>()
    const sync = coordinator.runSync('workspace-a', async (signal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })),
          { once: true },
        )
        started.resolve()
      })
      return 'unreachable'
    })
    await started.promise
    expect(coordinator.cancel('workspace-a')).toBe(true)

    await expect(sync).rejects.toMatchObject({ name: 'AbortError' })
    expect(coordinator.cancel('workspace-a')).toBe(false)
  })
})
