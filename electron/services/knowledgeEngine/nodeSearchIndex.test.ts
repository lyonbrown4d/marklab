import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { NodeSearchDocumentRepository } from '@electron/services/knowledgeEngine/nodeSearchDocumentRepository'
import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex'

const tempRoots: string[] = []
const indexes: NodeSearchIndex[] = []

const createIndex = (...args: ConstructorParameters<typeof NodeSearchIndex>): NodeSearchIndex => {
  const index = new NodeSearchIndex(...args)
  indexes.push(index)
  return index
}

afterEach(async () => {
  await Promise.all(indexes.splice(0).map((index) => index.close()))
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
    const index = createIndex()
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
    const index = createIndex()
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
    const first = createIndex(storageRoot)
    await first.rebuild([
      { path: 'notes/persisted.md', title: 'Persisted', content: 'durable needle' },
    ])

    const restarted = createIndex(storageRoot)

    await expect(restarted.hasDocuments()).resolves.toBe(true)
    await expect(restarted.search('durable needle')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/persisted.md' }],
    })
  })

  it('persists normalized upsert and prefix removals', async () => {
    const storageRoot = await createStorageRoot()
    const first = createIndex(storageRoot)
    await first.rebuild([
      { path: 'notes/one.md', title: 'One', content: 'alpha' },
      { path: 'notes-old/two.md', title: 'Two', content: 'alpha' },
    ])
    await first.upsert({ path: '.\\notes\\deep\\three.md', title: 'Three', content: 'alpha' })
    await first.removePrefix('.\\notes\\')

    const restarted = createIndex(storageRoot)
    const result = await restarted.search('alpha', { order: 'path' })

    expect(result.results.map((entry) => entry.path)).toEqual(['notes-old/two.md'])
  })

  it('rejects an invalid mutation asynchronously and rolls back the complete batch', async () => {
    const index = createIndex()
    await index.rebuild([{ path: 'stable.md', title: 'Stable', content: 'committed value' }])
    let operation: Promise<void> | undefined

    expect(() => {
      operation = index.applyBatch({
        removeDocuments: ['stable.md'],
        removePrefixes: [],
        upserts: [{ path: './', title: 'Invalid', content: 'broken' }],
      })
    }).not.toThrow()
    await expect(operation).rejects.toThrow(/workspace file/i)

    await expect(index.search('committed')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'stable.md' }],
    })
  })

  it('keeps CJK, path, and fuzzy retrieval correct across incremental replacement and restart', async () => {
    const storageRoot = await createStorageRoot()
    const index = createIndex(storageRoot, 'workspace-a')
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

    const restarted = createIndex(storageRoot, 'workspace-a')
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

  it('uses FTS5 for AND, prefix, fuzzy, and CJK retrieval while preserving substrings', async () => {
    const index = createIndex()
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

  it('falls back to bounded fuzzy matching when the typo and candidate share no trigrams', async () => {
    const unboundedList = vi.spyOn(NodeSearchDocumentRepository.prototype, 'list')
    const index = createIndex()
    await index.rebuild([
      {
        path: 'notes/fuzzy.md',
        title: 'ABCDE',
        content: 'A zero-shared-trigram fuzzy-search fixture.',
      },
      { path: 'notes/other.md', title: 'Other', content: 'unrelated content' },
    ])

    await expect(index.search('abxde')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/fuzzy.md', title: 'ABCDE' }],
    })
    expect(unboundedList).not.toHaveBeenCalled()
  })

  it('maps folded matches back to UTF-16 snippet offsets and editor columns', async () => {
    const index = createIndex()
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

  it('rejects a SQLite index from another workspace so the caller can rebuild safely', async () => {
    const storageRoot = await createStorageRoot()
    const first = createIndex(storageRoot, 'workspace-a')
    await first.rebuild([{ path: 'secret.md', title: 'Secret', content: 'workspace A only' }])

    const moved = createIndex(storageRoot, 'workspace-b')

    await expect(moved.hasDocuments()).resolves.toBe(false)
    await expect(moved.search('workspace')).resolves.toMatchObject({ totalHits: 0 })
  })
})
