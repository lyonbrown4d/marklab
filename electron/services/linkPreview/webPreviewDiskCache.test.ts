import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { WebPreviewDiskCache } from '@electron/services/linkPreview/webPreviewDiskCache.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

const createCache = async (options: { maxBytes?: number; ttlMs?: number } = {}) => {
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
})
