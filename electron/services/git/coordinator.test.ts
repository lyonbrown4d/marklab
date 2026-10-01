import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { GitOperationCoordinator } from '@electron/services/git/coordinator.js'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { force: true, recursive: true })
})

describe('GitOperationCoordinator', () => {
  it('serializes mutations sharing a canonical repository root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-coordinator-'))
    roots.push(root)
    const coordinator = new GitOperationCoordinator()
    let releaseFirst: () => void = () => {}
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const order: string[] = []

    const first = coordinator.mutate(root, async () => {
      order.push('first:start')
      await firstGate
      order.push('first:end')
    })
    const second = coordinator.mutate(path.join(root, '.'), async () => {
      order.push('second')
    })
    await vi.waitFor(() => expect(order).toEqual(['first:start']))
    releaseFirst()
    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('deduplicates concurrent queries and reuses their cached value', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-query-'))
    roots.push(root)
    const coordinator = new GitOperationCoordinator(5_000)
    const load = vi.fn().mockResolvedValue({ branch: 'main' })

    const [first, second] = await Promise.all([
      coordinator.query(root, 'remote-status', load),
      coordinator.query(path.join(root, '.'), 'remote-status', load),
    ])
    const third = await coordinator.query(root, 'remote-status', load)

    expect(first).toEqual({ branch: 'main' })
    expect(second).toEqual(first)
    expect(third).toEqual(first)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('invalidates cached queries after a mutation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-invalidate-'))
    roots.push(root)
    const coordinator = new GitOperationCoordinator(5_000)
    const load = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2)

    await coordinator.query(root, 'remote-status', load)
    await coordinator.mutate(root, async () => undefined)

    await expect(coordinator.query(root, 'remote-status', load)).resolves.toBe(2)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('waits for an in-flight query before mutating and does not recache stale data', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-query-mutation-'))
    roots.push(root)
    const coordinator = new GitOperationCoordinator(5_000)
    let resolveQuery: (value: number) => void = () => {}
    const queryValue = new Promise<number>((resolve) => {
      resolveQuery = resolve
    })
    const load = vi.fn().mockReturnValueOnce(queryValue).mockResolvedValueOnce(2)
    const query = coordinator.query(root, 'remote-status', load)
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1))
    const work = vi.fn().mockResolvedValue(undefined)

    const mutation = coordinator.mutate(root, work)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(work).not.toHaveBeenCalled()
    resolveQuery(1)
    await query
    await mutation

    await expect(coordinator.query(root, 'remote-status', load)).resolves.toBe(2)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('invalidates cached data before releasing queries waiting on a mutation', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-query-release-'))
    roots.push(root)
    const coordinator = new GitOperationCoordinator(5_000)
    await coordinator.query(root, 'remote-status', async () => 1)
    let releaseMutation: () => void = () => {}
    const mutationGate = new Promise<void>((resolve) => {
      releaseMutation = resolve
    })
    const mutationStarted = vi.fn()
    const mutation = coordinator.mutate(root, async () => {
      mutationStarted()
      await mutationGate
    })
    await vi.waitFor(() => expect(mutationStarted).toHaveBeenCalledOnce())
    const loadFresh = vi.fn().mockResolvedValue(2)
    const query = coordinator.query(root, 'remote-status', loadFresh)

    releaseMutation()
    await mutation

    await expect(query).resolves.toBe(2)
    expect(loadFresh).toHaveBeenCalledOnce()
  })

  it('does not refill a cache entry invalidated during an in-flight query', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-query-generation-'))
    roots.push(root)
    const coordinator = new GitOperationCoordinator(5_000)
    let resolveStale: (value: number) => void = () => {}
    const staleValue = new Promise<number>((resolve) => {
      resolveStale = resolve
    })
    const staleLoad = vi.fn().mockReturnValue(staleValue)
    const staleQuery = coordinator.query(root, 'status', staleLoad)
    await vi.waitFor(() => expect(staleLoad).toHaveBeenCalledOnce())

    await coordinator.invalidate(root)
    resolveStale(1)
    await expect(staleQuery).resolves.toBe(1)

    const freshLoad = vi.fn().mockResolvedValue(2)
    await expect(coordinator.query(root, 'status', freshLoad)).resolves.toBe(2)
    expect(freshLoad).toHaveBeenCalledOnce()
  })

  it('admits a query before a later mutation even when canonicalization is delayed', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-query-admission-'))
    roots.push(root)
    let releaseCanonicalize: () => void = () => {}
    const canonicalizeGate = new Promise<void>((resolve) => {
      releaseCanonicalize = resolve
    })
    let canonicalizeCalls = 0
    const canonicalize = vi.fn(async (candidate: string) => {
      canonicalizeCalls += 1
      if (canonicalizeCalls === 1) await canonicalizeGate
      return path.resolve(candidate).replaceAll('\\', '/').toLowerCase()
    })
    const coordinator = new GitOperationCoordinator(5_000, canonicalize)
    let releaseQuery: (value: number) => void = () => {}
    const queryValue = new Promise<number>((resolve) => {
      releaseQuery = resolve
    })
    const queryStarted = vi.fn()
    const query = coordinator.query(root, 'status', async () => {
      queryStarted()
      return queryValue
    })
    const mutationWork = vi.fn().mockResolvedValue(undefined)
    const mutation = coordinator.mutate(root, mutationWork)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(canonicalize).toHaveBeenCalledOnce()
    expect(queryStarted).not.toHaveBeenCalled()
    expect(mutationWork).not.toHaveBeenCalled()

    releaseCanonicalize()
    await vi.waitFor(() => expect(queryStarted).toHaveBeenCalledOnce())
    expect(mutationWork).not.toHaveBeenCalled()
    releaseQuery(1)
    await query
    await mutation
    expect(mutationWork).toHaveBeenCalledOnce()
  })
})
