import { afterEach, describe, expect, it, vi } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'
import { NodeSearchDatabase } from '@electron/services/knowledgeEngine/nodeSearchDatabase'

const indexes: NodeSearchIndex[] = []

const createIndex = (...args: ConstructorParameters<typeof NodeSearchIndex>): NodeSearchIndex => {
  const index = new NodeSearchIndex(...args)
  indexes.push(index)
  return index
}

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(indexes.splice(0).map((index) => index.close()))
})

describe('NodeSearchIndex rebuild lifecycle', () => {
  it('rebuilds large indexes in bounded chunks that yield to the event loop', async () => {
    const yieldControl = vi.fn(async () => undefined)
    const index = createIndex(undefined, '', { chunkSize: 2, yieldControl })
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
    const index = createIndex(undefined, '', { chunkSize: 1, yieldControl })
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
    const index = createIndex(undefined, '', { chunkSize: 1, yieldControl })
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

  it('reports real index statistics and the most recent build error', async () => {
    const index = createIndex()
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

  it('treats close as terminal and rejects work that could reopen the database', async () => {
    const index = createIndex()
    await index.upsert({ path: 'notes/a.md', title: 'A', content: 'alpha' })

    await index.close()

    await expect(index.upsert({ path: 'notes/b.md', title: 'B', content: 'beta' })).rejects.toThrow(
      'closed',
    )
    await expect(index.search('alpha')).rejects.toThrow('closed')
  })

  it('waits for an admitted search before destroying the database', async () => {
    let enterSearch!: () => void
    let releaseSearch!: () => void
    const entered = new Promise<void>((resolve) => {
      enterSearch = resolve
    })
    const blocked = new Promise<void>((resolve) => {
      releaseSearch = resolve
    })
    vi.spyOn(NodeSearchDatabase.prototype, 'searchBatches').mockImplementation(async function* () {
      enterSearch()
      await blocked
      yield []
    })
    const index = createIndex()
    const search = index.search('alpha')
    await entered
    let didClose = false

    const close = index.close().then(() => {
      didClose = true
    })
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(didClose).toBe(false)
    releaseSearch()
    await Promise.all([search, close])
    expect(didClose).toBe(true)
  })
})
