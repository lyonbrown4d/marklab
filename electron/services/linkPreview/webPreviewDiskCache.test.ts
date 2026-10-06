import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type SchedulerLike, VirtualTimeScheduler } from 'rxjs'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebPreviewDiskCache } from '@electron/services/linkPreview/webPreviewDiskCache'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

const createCache = async (
  options: {
    maintenanceIntervalMs?: number
    maintenanceScheduler?: SchedulerLike
    maxBytes?: number
    ttlMs?: number
  } = {},
) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-web-preview-'))
  roots.push(root)
  return { cache: new WebPreviewDiskCache({ root, ...options }), root }
}

describe('WebPreviewDiskCache', () => {
  it('persists captures by normalized URL and returns an independent byte view', async () => {
    const { cache } = await createCache()
    const bytes = new Uint8Array([1, 2, 3])

    await cache.set('https://example.com', bytes)
    bytes[0] = 9

    await expect(cache.get('https://example.com/')).resolves.toEqual(new Uint8Array([1, 2, 3]))
  })

  it('expires stale captures and prunes least-recently-used files to the byte budget', async () => {
    const { cache, root } = await createCache({ maxBytes: 5, ttlMs: 1_000 })
    await cache.set('https://example.com/old', new Uint8Array([1, 2, 3]))
    const oldFile = (await fs.readdir(root)).find((file) => file.endsWith('.jpg'))
    if (!oldFile) throw new Error('Expected cached preview')
    const staleTime = new Date(Date.now() - 2_000)
    await fs.utimes(path.join(root, oldFile), staleTime, staleTime)

    await expect(cache.get('https://example.com/old')).resolves.toBeNull()

    await cache.set('https://example.com/first', new Uint8Array([1, 2, 3]))
    await new Promise((resolve) => setTimeout(resolve, 5))
    await cache.set('https://example.com/second', new Uint8Array([4, 5, 6]))

    await expect(cache.get('https://example.com/first')).resolves.toBeNull()
    await expect(cache.get('https://example.com/second')).resolves.toEqual(
      new Uint8Array([4, 5, 6]),
    )
  })

  it('cleans expired rebuildable captures on startup and on a background schedule', async () => {
    const { cache, root } = await createCache({ ttlMs: 1_000 })
    await cache.set('https://example.com/stale', new Uint8Array([1, 2, 3]))
    const cachedFile = (await fs.readdir(root)).find((file) => file.endsWith('.jpg'))
    if (!cachedFile) throw new Error('Expected cached preview')
    const staleTime = new Date(Date.now() - 2_000)
    await fs.utimes(path.join(root, cachedFile), staleTime, staleTime)

    cache.startMaintenance()

    await vi.waitFor(async () => expect(await fs.readdir(root)).toEqual([]))
    cache.dispose()
  })

  it('runs periodic maintenance with an injectable scheduler', async () => {
    const intervalMs = 10_000
    const scheduler = new VirtualTimeScheduler(undefined, intervalMs)
    const { cache, root } = await createCache({
      maintenanceIntervalMs: intervalMs,
      maintenanceScheduler: scheduler,
      ttlMs: 1_000,
    })
    cache.startMaintenance()
    await cache.set('https://example.com/scheduled', new Uint8Array([1, 2, 3]))
    const cachedFile = (await fs.readdir(root)).find((file) => file.endsWith('.jpg'))
    if (!cachedFile) throw new Error('Expected cached preview')
    const staleTime = new Date(Date.now() - 2_000)
    await fs.utimes(path.join(root, cachedFile), staleTime, staleTime)

    scheduler.flush()

    await vi.waitFor(async () => expect(await fs.readdir(root)).toEqual([]))
    cache.dispose()
  })

  it('does not overlap periodic maintenance runs', async () => {
    const intervalMs = 10_000
    const scheduler = new VirtualTimeScheduler(undefined, intervalMs)
    const { cache } = await createCache({
      maintenanceIntervalMs: intervalMs,
      maintenanceScheduler: scheduler,
    })
    let releaseFirstRead!: () => void
    const firstRead = new Promise<void>((resolve) => {
      releaseFirstRead = resolve
    })
    const readdirSpy = vi.spyOn(fs, 'readdir').mockImplementationOnce(async () => {
      await firstRead
      return []
    })

    cache.startMaintenance()
    scheduler.flush()

    expect(readdirSpy).toHaveBeenCalledTimes(1)
    releaseFirstRead()
    await vi.waitFor(() => expect(readdirSpy).toHaveBeenCalledTimes(1))
    cache.dispose()
  })

  it('stops scheduled maintenance when disposed repeatedly', async () => {
    const intervalMs = 10_000
    const scheduler = new VirtualTimeScheduler(undefined, intervalMs)
    const { cache, root } = await createCache({
      maintenanceIntervalMs: intervalMs,
      maintenanceScheduler: scheduler,
      ttlMs: 1_000,
    })
    cache.startMaintenance()
    await cache.set('https://example.com/disposed', new Uint8Array([1, 2, 3]))
    const cachedFile = (await fs.readdir(root)).find((file) => file.endsWith('.jpg'))
    if (!cachedFile) throw new Error('Expected cached preview')
    const staleTime = new Date(Date.now() - 2_000)
    await fs.utimes(path.join(root, cachedFile), staleTime, staleTime)

    cache.dispose()
    cache.dispose()
    scheduler.flush()

    await expect(fs.readdir(root)).resolves.toEqual([cachedFile])
  })
})
