import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { WorkspaceSearchIndex } from '@electron/services/workspace/workspaceSearchIndex.js'

const tempDirs: string[] = []

const createIndex = async (): Promise<WorkspaceSearchIndex> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-index-'))
  tempDirs.push(dir)
  const index = new WorkspaceSearchIndex()
  await index.open(path.join(dir, 'search'))
  return index
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

describe('WorkspaceSearchIndex', () => {
  it('matches terms that occur on different body lines', async () => {
    const index = await createIndex()
    await index.rebuild([
      {
        path: 'notes/project.md',
        title: 'project',
        content: 'alpha lives here\nbeta lives there',
      },
    ])

    const results = await index.search('alpha beta', 10)
    await index.close()

    expect(results).toHaveLength(1)
    expect(results[0]?.path).toBe('notes/project.md')
  })

  it('matches short prefixes in indexed content', async () => {
    const index = await createIndex()
    await index.rebuild([
      {
        path: 'notes/markdown-search.md',
        title: 'markdown-search',
        content: 'markdown native search',
      },
    ])

    const results = await index.search('ma', 10)
    await index.close()

    expect(results[0]?.path).toBe('notes/markdown-search.md')
  })

  it('keeps native indexes isolated per workspace key', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-index-'))
    tempDirs.push(dir)
    const first = new WorkspaceSearchIndex()
    await first.open(path.join(dir, 'first'))
    await first.rebuild([
      {
        path: 'notes/first.md',
        title: 'first',
        content: 'alpha',
      },
    ])
    await first.close()

    const second = new WorkspaceSearchIndex()
    await second.open(path.join(dir, 'second'))
    const hasDocuments = await second.hasDocuments()
    await second.close()

    expect(hasDocuments).toBe(false)
  })

  it('uses the same case and unicode folding as memory search', async () => {
    const index = await createIndex()
    await index.rebuild([
      {
        path: 'Notes/Café.md',
        title: 'Café',
        content: 'Résumé API',
      },
    ])

    const results = await index.search('CAFE resume', 10)
    await index.close()

    expect(results[0]?.path).toBe('Notes/Café.md')
    expect(results[0]?.snippet_highlights.length).toBeGreaterThan(0)
  })

  it('treats query syntax characters as search text without throwing', async () => {
    const index = await createIndex()
    await index.rebuild([
      {
        path: 'code/cpp.md',
        title: 'cpp',
        content: 'Prefer C++ examples with literal (alpha:beta) text.',
      },
    ])

    await expect(index.search('C++ (alpha:beta)', 10)).resolves.toMatchObject([
      { path: 'code/cpp.md' },
    ])
    await index.close()
  })

  it('returns stable snippets for path and title matches', async () => {
    const index = await createIndex()
    await index.rebuild([
      {
        path: 'guides/install-guide.md',
        title: 'Install Guide',
        content: '',
      },
    ])

    const results = await index.search('install', 10)
    await index.close()

    expect(results[0]).toMatchObject({
      path: 'guides/install-guide.md',
      title: 'install-guide',
      line: 1,
      snippet: 'install-guide',
    })
  })
})
