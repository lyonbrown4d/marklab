import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { NodeSearchIndex } from '@electron/services/knowledgeEngine/nodeSearchIndex.js'

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
  it('matches every folded query term across title, path, and content', async () => {
    const index = new NodeSearchIndex()
    await index.rebuild([
      {
        path: '.\\Notes\\Café Plan.md',
        title: 'Résumé',
        content: 'Launch details live here.',
      },
      { path: 'notes/cafe-only.md', title: 'Cafe', content: 'Unrelated draft' },
    ])

    const result = await index.search('resume café launch')

    expect(result.totalHits).toBe(1)
    expect(result.results).toMatchObject([
      {
        path: 'Notes/Café Plan.md',
        title: 'Résumé',
        snippet: 'Résumé',
        score: 24,
      },
    ])
  })

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
    await fs.writeFile(path.join(storageRoot, 'search-index-v1.json'), '{broken')

    const restarted = new NodeSearchIndex(storageRoot)

    await expect(restarted.search('recoverable')).resolves.toMatchObject({
      totalHits: 1,
      results: [{ path: 'notes/stable.md' }],
    })
    await expect(restarted.search('latest')).resolves.toMatchObject({ totalHits: 0 })
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
})
