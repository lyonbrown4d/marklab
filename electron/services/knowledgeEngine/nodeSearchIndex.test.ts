import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'
import { NodeSearchSnapshot } from '@electron/services/knowledgeEngine/nodeSearchSnapshot.js'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

const createStorageRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-node-search-'))
  tempRoots.push(root)
  return root
}

describe('NodeSearchIndex', () => {
  it('treats include paths as normalized exact files or directory prefixes', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      { path: 'notes/project.md', title: 'Project', content: 'alpha' },
      { path: 'notes/deep/project.md', title: 'Deep', content: 'alpha' },
      { path: 'notes-old/project.md', title: 'Old', content: 'alpha' },
      { path: 'archive/project.md', title: 'Archive', content: 'alpha' },
    ])

    const directory = await index.search('alpha', {
      includePaths: ['.\\notes\\'],
      order: 'path',
    })
    const exactFile = await index.search('alpha', {
      includePaths: ['./notes/project.md'],
      order: 'path',
    })

    expect(directory.results.map((result) => result.path)).toEqual([
      'notes/deep/project.md',
      'notes/project.md',
    ])
    expect(exactFile.results.map((result) => result.path)).toEqual(['notes/project.md'])
  })

  it('applies deterministic ordering before offset and limit', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      { path: 'zeta/readme.md', title: 'Readme', content: 'alpha' },
      { path: 'alpha/readme.md', title: 'Readme', content: 'alpha' },
      { path: 'notes/beta.md', title: 'Beta', content: 'alpha' },
      { path: 'notes/charlie.md', title: 'Charlie', content: 'alpha' },
    ])

    const page = await index.search('alpha', { limit: 2, offset: 1, order: 'title' })

    expect(page.totalHits).toBe(4)
    expect(page.results.map((result) => result.path)).toEqual([
      'notes/charlie.md',
      'alpha/readme.md',
    ])
    expect(page.diagnostics).toBeUndefined()
  })

  it('restores persisted documents after the sidecar restarts', async () => {
    const storageRoot = await createStorageRoot()
    const first = new NodeSearchIndex(storageRoot)
    await first.rebuild([
      { path: 'notes/persisted.md', title: 'Persisted', content: 'durable needle' },
    ])

    const restarted = new NodeSearchIndex(storageRoot)

    await expect(restarted.hasDocuments()).resolves.toBe(true)
    await expect(restarted.search('durable needle')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/persisted.md' }],
    })
  })

  it('recovers the previous atomic snapshot when the primary snapshot is corrupt', async () => {
    const storageRoot = await createStorageRoot()
    const first = new NodeSearchIndex(storageRoot)
    await first.rebuild([{ path: 'notes/stable.md', title: 'Stable', content: 'recoverable' }])
    await first.upsert({ path: 'notes/new.md', title: 'New', content: 'latest' })
    await fs.writeFile(path.join(storageRoot, 'search-index-v2.json'), '{broken')

    const restarted = new NodeSearchIndex(storageRoot)

    await expect(restarted.search('recoverable')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/stable.md' }],
    })
    await expect(restarted.search('latest')).resolves.toMatchObject({ totalHits: 0 })
  })

  it('falls back to an empty rebuildable index when primary and backup are both corrupt', async () => {
    const storageRoot = await createStorageRoot()
    const first = new NodeSearchIndex(storageRoot, 'workspace-a')
    await first.rebuild([{ path: 'stable.md', title: 'Stable', content: 'first' }])
    await first.upsert({ path: 'second.md', title: 'Second', content: 'second' })
    await fs.writeFile(path.join(storageRoot, 'search-index-v2.json'), '{broken-primary')
    await fs.writeFile(path.join(storageRoot, 'search-index-v2.backup.json'), '{broken-backup')

    const restarted = new NodeSearchIndex(storageRoot, 'workspace-a')

    await expect(restarted.hasDocuments()).resolves.toBe(false)
    await expect(restarted.getStats()).resolves.toMatchObject({
      documentCount: 0,
      lastError: expect.stringMatching(/snapshot/i),
    })
    await restarted.rebuild([
      { path: 'recovered.md', title: 'Recovered', content: 'healthy again' },
    ])
    await expect(restarted.search('healthy')).resolves.toMatchObject({ totalHits: 1 })
  })

  it('persists normalized upsert and prefix removals', async () => {
    const storageRoot = await createStorageRoot()
    const first = new NodeSearchIndex(storageRoot)
    await first.rebuild([
      { path: 'notes/one.md', title: 'One', content: 'alpha' },
      { path: 'notes-old/two.md', title: 'Two', content: 'alpha' },
    ])
    await first.upsert({ path: '.\\notes\\deep\\three.md', title: 'Three', content: 'alpha' })
    await first.removePrefix('.\\notes\\')

    const restarted = new NodeSearchIndex(storageRoot)
    const result = await restarted.search('alpha', { order: 'path' })

    expect(result.results.map((entry) => entry.path)).toEqual(['notes-old/two.md'])
  })

  it('keeps CJK, path, and fuzzy retrieval correct across incremental replacement and restart', async () => {
    const storageRoot = await createStorageRoot()
    const index = new NodeSearchIndex(storageRoot, 'workspace-a')
    await index.rebuild([
      { path: 'drafts/roadmap.md', title: 'Old roadmap', content: 'obsolete content' },
      { path: 'archive/remove.md', title: 'Remove', content: 'remove marker' },
    ])

    await index.applyBatch({
      removeDocuments: ['archive/remove.md'],
      removePrefixes: [],
      upserts: [
        {
          path: '规划/路线图.md',
          title: '本地知识库路线图',
          content: '沉浸式全文搜索与协作体验',
        },
        {
          path: 'drafts/roadmap.md',
          title: 'Collaboration roadmap',
          content: 'durable local search protocol',
        },
      ],
    })

    const restarted = new NodeSearchIndex(storageRoot, 'workspace-a')
    await expect(restarted.search('全文搜索')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: '规划/路线图.md' }],
    })
    await expect(restarted.search('规划 路线')).resolves.toMatchObject({ totalHits: 1 })
    await expect(restarted.search('colaboration protocol')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'drafts/roadmap.md' }],
    })
    await expect(restarted.search('obsolete')).resolves.toMatchObject({ totalHits: 0 })
    await expect(restarted.search('remove marker')).resolves.toMatchObject({ totalHits: 0 })
  })

  it('uses MiniSearch for AND, prefix, fuzzy, and CJK retrieval while preserving substrings', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      {
        path: 'notes/collaboration.md',
        title: 'Collaboration Protocol',
        content: 'A durable workspace protocol.',
      },
      {
        path: 'notes/search.md',
        title: '本地知识库',
        content: '沉浸式全文搜索体验',
      },
      {
        path: 'code/cpp.md',
        title: 'C++ Guide',
        content: 'Literal (alpha:beta) syntax.',
      },
    ])

    await expect(index.search('collab protocol')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/collaboration.md' }],
    })
    await expect(index.search('colaboration')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/collaboration.md' }],
    })
    await expect(index.search('全文搜索')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/search.md' }],
    })
    await expect(index.search('C++ (alpha:beta)')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'code/cpp.md' }],
    })
  })

  it('maps folded matches back to UTF-16 snippet offsets and editor columns', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([{ path: 'unicode.md', title: 'Unicode', content: '🙂 Café 搜索' }])

    const result = await index.search('cafe')

    expect(result.results[0]).toMatchObject({
      column: 4,
      end_column: 8,
      line: 1,
      snippet: '🙂 Café 搜索',
      snippet_highlights: [{ start: 3, end: 7 }],
    })
  })

  it('persists one versioned MiniSearch snapshot envelope for a mutation batch', async () => {
    const storageRoot = await createStorageRoot()
    const index = new NodeSearchIndex(storageRoot, 'workspace-a')
    await index.rebuild([
      { path: 'remove.md', title: 'Remove', content: 'old' },
      { path: 'folder/remove.md', title: 'Nested', content: 'old' },
    ])
    const write = vi.spyOn(NodeSearchSnapshot.prototype, 'write')

    await index.applyBatch({
      removeDocuments: ['remove.md'],
      removePrefixes: ['folder'],
      upserts: [{ path: 'added.md', title: 'Added', content: 'new searchable text' }],
    })

    expect(write).toHaveBeenCalledTimes(1)
    const envelope = JSON.parse(
      await fs.readFile(path.join(storageRoot, 'search-index-v2.json'), 'utf8'),
    ) as Record<string, unknown>
    expect(envelope).toMatchObject({
      schemaVersion: 2,
      engine: 'minisearch',
      options: expect.objectContaining({ fields: ['title', 'path', 'content'] }),
      workspace: { identity: 'workspace-a' },
      source: expect.objectContaining({ documentCount: 1 }),
      index: expect.any(Object),
    })
    const restarted = new NodeSearchIndex(storageRoot, 'workspace-a')
    await expect(restarted.search('searchable')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'added.md' }],
    })
  })

  it('rejects a snapshot from another workspace so the caller can rebuild safely', async () => {
    const storageRoot = await createStorageRoot()
    const first = new NodeSearchIndex(storageRoot, 'workspace-a')
    await first.rebuild([{ path: 'secret.md', title: 'Secret', content: 'workspace A only' }])

    const moved = new NodeSearchIndex(storageRoot, 'workspace-b')

    await expect(moved.hasDocuments()).resolves.toBe(false)
    await expect(moved.search('workspace')).resolves.toMatchObject({ totalHits: 0 })
  })

  it('loads legacy v1 document snapshots by rebuilding the in-memory index', async () => {
    const storageRoot = await createStorageRoot()
    await fs.writeFile(
      path.join(storageRoot, 'search-index-v1.json'),
      JSON.stringify({
        version: 1,
        documents: [{ path: 'legacy.md', title: 'Legacy', content: 'migrated safely' }],
        metadata: { documentCount: 1, updatedAt: new Date().toISOString() },
      }),
    )

    const index = new NodeSearchIndex(storageRoot, 'workspace-a')

    await expect(index.search('migrated')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'legacy.md' }],
    })
  })
})
