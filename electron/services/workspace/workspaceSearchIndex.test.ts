import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { FsSearchResult } from '@electron/services/workspace/types.js'
import {
  WorkspaceSearchIndex,
  type WorkspaceSearchIndexBackend,
} from '@electron/services/workspace/workspaceSearchIndex.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const tempDirs: string[] = []

const createIndex = async (): Promise<WorkspaceSearchIndex> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-index-'))
  tempDirs.push(dir)
  const index = new WorkspaceSearchIndex(new FakeSearchBackend())
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
        content: 'markdown sidecar search',
      },
    ])

    const results = await index.search('ma', 10)
    await index.close()

    expect(results[0]?.path).toBe('notes/markdown-search.md')
  })

  it('keeps sidecar workspace indexes isolated per workspace key', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-index-'))
    tempDirs.push(dir)
    const backend = new FakeSearchBackend()
    const first = new WorkspaceSearchIndex(backend)
    await first.open(path.join(dir, 'first'))
    await first.rebuild([
      {
        path: 'notes/first.md',
        title: 'first',
        content: 'alpha',
      },
    ])
    await first.close()

    const second = new WorkspaceSearchIndex(backend)
    await second.open(path.join(dir, 'second'))
    const hasDocuments = await second.hasDocuments()
    await second.close()

    expect(hasDocuments).toBe(false)
  })

  it('creates the index directory before opening the backend', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'marklab-search-index-'))
    tempDirs.push(dir)
    const backend = new DirectoryCheckingSearchBackend()
    const index = new WorkspaceSearchIndex(backend)

    await index.open(path.join(dir, 'nested', 'search'))
    await index.close()

    expect(backend.openedPaths).toEqual([path.join(dir, 'nested', 'search')])
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

class FakeSearchBackend implements WorkspaceSearchIndexBackend {
  private readonly documentsByWorkspace = new Map<string, WorkspaceSearchDocument[]>()

  async open(workspaceId: string): Promise<void> {
    if (!this.documentsByWorkspace.has(workspaceId)) {
      this.documentsByWorkspace.set(workspaceId, [])
    }
  }

  async close(): Promise<void> {
    return undefined
  }

  async hasDocuments(workspaceId: string): Promise<boolean> {
    return Boolean(this.documentsByWorkspace.get(workspaceId)?.length)
  }

  async rebuild(workspaceId: string, documents: WorkspaceSearchDocument[]): Promise<void> {
    this.documentsByWorkspace.set(workspaceId, documents)
  }

  async upsertDocument(workspaceId: string, document: WorkspaceSearchDocument): Promise<void> {
    const documents = this.documentsByWorkspace.get(workspaceId) ?? []
    const next = documents.filter((item) => item.path !== document.path)
    next.push(document)
    this.documentsByWorkspace.set(workspaceId, next)
  }

  async removeDocument(workspaceId: string, pathValue: string): Promise<void> {
    const documents = this.documentsByWorkspace.get(workspaceId) ?? []
    this.documentsByWorkspace.set(
      workspaceId,
      documents.filter((document) => document.path !== pathValue),
    )
  }

  async removePathPrefix(workspaceId: string, prefix: string): Promise<void> {
    const documents = this.documentsByWorkspace.get(workspaceId) ?? []
    this.documentsByWorkspace.set(
      workspaceId,
      documents.filter((document) => !document.path.startsWith(prefix)),
    )
  }

  async search(workspaceId: string, query: string, limit: number): Promise<FsSearchResult[]> {
    const terms = foldText(query).split(/\s+/).filter(Boolean)
    const documents = this.documentsByWorkspace.get(workspaceId) ?? []

    return documents.flatMap((document) => searchDocument(document, terms)).slice(0, limit)
  }
}

class DirectoryCheckingSearchBackend extends FakeSearchBackend {
  readonly openedPaths: string[] = []

  override async open(workspaceId: string, indexPath?: string): Promise<void> {
    if (!indexPath) throw new Error('Expected index path')
    const info = await stat(indexPath)
    expect(info.isDirectory()).toBe(true)
    this.openedPaths.push(indexPath)
    await super.open(workspaceId)
  }
}

const searchDocument = (document: WorkspaceSearchDocument, terms: string[]): FsSearchResult[] => {
  const title = path.basename(document.path, path.extname(document.path))
  const haystack = foldText(`${title}\n${document.path}\n${document.content}`)
  if (!terms.every((term) => haystack.includes(term))) return []

  const snippet = foldText(title).includes(terms[0] ?? '')
    ? title
    : (document.content
        .split(/\r?\n/)
        .find((line) => terms.some((term) => foldText(line).includes(term))) ?? title)

  return [
    {
      path: document.path,
      title,
      line: 1,
      column: 1,
      end_column: 1,
      snippet,
      snippet_highlights: terms.flatMap((term) => {
        const start = foldText(snippet).indexOf(term)
        return start >= 0 ? [{ start, end: start + term.length }] : []
      }),
      score: terms.length,
    },
  ]
}

const foldText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
