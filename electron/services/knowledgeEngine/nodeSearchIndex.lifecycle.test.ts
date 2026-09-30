import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'
import { NodeSearchSnapshot } from '@electron/services/knowledgeEngine/nodeSearchSnapshot.js'
import type { NodeSearchWorkerBuildResult } from '@electron/services/knowledgeEngine/nodeSearchWorkerMessages.js'

const tempRoots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('NodeSearchIndex rebuild lifecycle', () => {
  it('rebuilds large indexes in bounded chunks that yield to the event loop', async () => {
    const yieldControl = vi.fn(async () => undefined)
    const index = new NodeSearchIndex(undefined, '', { chunkSize: 2, yieldControl })
    const documents = Array.from({ length: 5 }, (_, index) => ({
      path: `notes/${index}.md`,
      title: `Note ${index}`,
      content: `content ${index}`,
    }))

    await index.rebuild(documents)

    expect(yieldControl.mock.calls.length).toBeGreaterThanOrEqual(2)
    await expect(index.getSize()).resolves.toBe(5)
  })

  it('supersedes an in-flight rebuild without publishing stale documents', async () => {
    let releaseFirstYield!: () => void
    let blockFirstYield = true
    const firstYield = new Promise<void>((resolve) => {
      releaseFirstYield = resolve
    })
    const yieldControl = vi.fn(() => (blockFirstYield ? firstYield : Promise.resolve()))
    const index = new NodeSearchIndex(undefined, '', { chunkSize: 1, yieldControl })
    const stale = index.rebuild([
      { path: 'stale-a.md', title: 'Stale A', content: 'obsolete' },
      { path: 'stale-b.md', title: 'Stale B', content: 'obsolete' },
    ])
    await vi.waitFor(() => expect(yieldControl).toHaveBeenCalledTimes(1))

    const current = index.rebuild([
      { path: 'current.md', title: 'Current', content: 'fresh searchable value' },
    ])
    blockFirstYield = false
    releaseFirstYield()
    await Promise.all([stale, current])

    await expect(index.search('obsolete')).resolves.toMatchObject({ totalHits: 0 })
    await expect(index.search('fresh')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'current.md' }],
    })
  })

  it('cancels an in-flight rebuild while keeping the last committed index readable', async () => {
    let releaseYield!: () => void
    const blockedYield = new Promise<void>((resolve) => {
      releaseYield = resolve
    })
    const yieldControl = vi.fn(() => blockedYield)
    const index = new NodeSearchIndex(undefined, '', { chunkSize: 1, yieldControl })
    await index.rebuild([{ path: 'stable.md', title: 'Stable', content: 'committed value' }])
    const stale = index.rebuild([
      { path: 'stale-a.md', title: 'Stale A', content: 'obsolete' },
      { path: 'stale-b.md', title: 'Stale B', content: 'obsolete' },
    ])
    await vi.waitFor(() => expect(yieldControl).toHaveBeenCalledTimes(1))

    index.cancelPendingRebuild()
    releaseYield()
    await stale

    await expect(index.search('committed')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'stable.md' }],
    })
    await expect(index.search('obsolete')).resolves.toMatchObject({ totalHits: 0 })
    await expect(index.getStats()).resolves.toMatchObject({ building: false, documentCount: 1 })
  })

  it('does not commit a rebuild snapshot that is cancelled during persistence', async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-search-cancel-'))
    tempRoots.push(storageRoot)
    const index = new NodeSearchIndex(storageRoot, 'workspace-a')
    await index.rebuild([{ path: 'stable.md', title: 'Stable', content: 'committed value' }])
    const originalWrite = NodeSearchSnapshot.prototype.write
    let releaseWrite!: () => void
    const blockedWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const write = vi
      .spyOn(NodeSearchSnapshot.prototype, 'write')
      .mockImplementationOnce(async function (this: NodeSearchSnapshot, ...args) {
        await blockedWrite
        return originalWrite.apply(this, args)
      })
    const stale = index.rebuild([{ path: 'stale.md', title: 'Stale', content: 'obsolete' }])
    await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))

    index.cancelPendingRebuild()
    releaseWrite()
    await stale

    const restarted = new NodeSearchIndex(storageRoot, 'workspace-a')
    await expect(restarted.search('committed')).resolves.toMatchObject({ totalHits: 1 })
    await expect(restarted.search('obsolete')).resolves.toMatchObject({ totalHits: 0 })
  })

  it('aborts the active worker when a large rebuild is cancelled', async () => {
    let markWorkerStarted!: () => void
    const workerStarted = new Promise<void>((resolve) => {
      markWorkerStarted = resolve
    })
    const workerRunner = {
      available: true,
      run: vi.fn(
        (_request: unknown, signal: AbortSignal) =>
          new Promise<NodeSearchWorkerBuildResult>((_resolve, reject) => {
            markWorkerStarted()
            signal.addEventListener('abort', () => {
              const error = new Error('aborted')
              error.name = 'AbortError'
              reject(error)
            })
          }),
      ),
    }
    const index = new NodeSearchIndex(undefined, 'workspace-a', {
      workerDocumentThreshold: 2,
      workerRunner,
    })
    await index.rebuild([{ path: 'stable.md', title: 'Stable', content: 'committed' }])
    const stale = index.rebuild([
      { path: 'stale-a.md', title: 'Stale A', content: 'obsolete' },
      { path: 'stale-b.md', title: 'Stale B', content: 'obsolete' },
    ])
    await workerStarted

    index.cancelPendingRebuild()

    await expect(stale).resolves.toBeUndefined()
    await expect(index.search('committed')).resolves.toMatchObject({ totalHits: 1 })
    expect(workerRunner.run.mock.calls[0]?.[1].aborted).toBe(true)
  })

  it('reports real index statistics and the most recent build error', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      { path: 'notes/a.md', title: 'A', content: 'alpha' },
      { path: 'notes/b.md', title: 'B', content: 'beta' },
    ])

    await expect(index.getStats()).resolves.toMatchObject({
      building: false,
      documentCount: 2,
      indexBytes: expect.any(Number),
      lastBuildDurationMs: expect.any(Number),
      lastBuildError: null,
      updatedAt: expect.any(String),
    })
    expect((await index.getStats()).indexBytes).toBeGreaterThan(0)

    await expect(
      index.rebuild([{ path: './', title: 'Invalid', content: 'broken' }]),
    ).rejects.toThrow(/workspace file/i)
    await expect(index.getStats()).resolves.toMatchObject({
      documentCount: 2,
      lastBuildError: expect.stringMatching(/workspace file/i),
    })
  })
})
