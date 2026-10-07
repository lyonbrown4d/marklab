import { describe, expect, it, vi } from 'vitest'

import { WorkspaceTreeQueryService } from '@electron/services/workspace/workspaceTreeQuery'
import type { FsEntry } from '@electron/services/workspace/types'

const entries: FsEntry[] = [
  { kind: 'file', name: 'z.md', path: 'z.md' },
  { kind: 'file', name: 'b.md', path: 'notes/b.md' },
  { kind: 'folder', name: 'nested', path: 'notes/nested' },
  { kind: 'file', name: 'a.md', path: 'notes/a.md' },
  { kind: 'folder', name: 'notes', path: 'notes' },
  { kind: 'file', name: 'deep.md', path: 'notes/nested/deep.md' },
  { kind: 'file', name: 'a.md', path: 'a.md' },
]

const createService = () =>
  new WorkspaceTreeQueryService({
    getEntries: async () => entries,
    getRevision: () => 7,
    getGeneration: () => 3,
    getRoot: () => ({ kind: 'external', path: '/workspace' }),
  })

describe('WorkspaceTreeQueryService', () => {
  it('returns only direct children using stable folder-first pagination', async () => {
    const service = createService()

    const first = await service.listChildren({ parent: 'notes', limit: 2 })
    const second = await service.listChildren({
      parent: 'notes',
      limit: 2,
      cursor: first.nextCursor,
    })

    expect(first).toEqual({
      entries: [
        { kind: 'folder', name: 'nested', path: 'notes/nested', hasChildren: true },
        { kind: 'file', name: 'a.md', path: 'notes/a.md', hasChildren: false },
      ],
      nextCursor: '3:7:2',
      parent: 'notes',
      generation: 3,
      revision: 7,
      root: { kind: 'external', path: '/workspace' },
    })
    expect(second.entries.map((entry) => entry.path)).toEqual(['notes/b.md'])
    expect(second.nextCursor).toBeNull()
  })

  it('rejects traversal, stale cursors, and limits above the hard maximum', async () => {
    const service = createService()

    await expect(service.listChildren({ parent: '../outside' })).rejects.toThrow('parent')
    await expect(service.listChildren({ parent: '', cursor: '3:6:2' })).rejects.toThrow('stale')
    await expect(service.listChildren({ parent: '', limit: 257 })).rejects.toThrow('limit')
  })

  it('checks a bounded batch and returns one default file without exposing the snapshot', async () => {
    const service = createService()

    await expect(
      service.pathsExist({ paths: ['notes/a.md', 'missing.md', 'notes'] }),
    ).resolves.toEqual({
      existing: ['notes/a.md', 'notes'],
      generation: 3,
      revision: 7,
      root: { kind: 'external', path: '/workspace' },
    })
    await expect(service.initialFile()).resolves.toEqual({
      generation: 3,
      path: 'a.md',
      revision: 7,
      root: { kind: 'external', path: '/workspace' },
    })
    await expect(
      service.pathsExist({ paths: Array.from({ length: 257 }, (_, index) => `${index}.md`) }),
    ).rejects.toThrow('paths')
  })

  it('supports files-only existence without accepting folders as document routes', async () => {
    const service = createService()

    await expect(
      service.pathsExist({ paths: ['notes', 'notes/a.md'], kind: 'file' }),
    ).resolves.toMatchObject({ existing: ['notes/a.md'] })
  })

  it('projects a single-file workspace as one bounded root child', async () => {
    const service = new WorkspaceTreeQueryService({
      getEntries: async () => [{ kind: 'file', name: 'only.md', path: 'only.md' }],
      getRevision: () => 1,
      getGeneration: () => 1,
      getRoot: () => ({ kind: 'single', path: '/workspace/only.md' }),
    })

    await expect(service.listChildren({ parent: null })).resolves.toMatchObject({
      entries: [{ kind: 'file', name: 'only.md', path: 'only.md', hasChildren: false }],
      revision: 1,
      root: { kind: 'single', path: '/workspace/only.md' },
    })
  })

  it('builds one revision-scoped parent index for a large flat paginated folder', async () => {
    const getEntries = vi.fn(async () =>
      Array.from({ length: 5_000 }, (_, index) => ({
        kind: 'file' as const,
        name: `${index}.md`,
        path: `${index}.md`,
      })),
    )
    const service = new WorkspaceTreeQueryService({
      getEntries,
      getRevision: () => 9,
      getGeneration: () => 4,
      getRoot: () => ({ kind: 'external', path: '/large' }),
    })

    const first = await service.listChildren({ parent: null, limit: 64 })
    await service.listChildren({ parent: null, limit: 64, cursor: first.nextCursor })

    expect(getEntries).toHaveBeenCalledOnce()
  })

  it('retries when the root switches while awaiting entries', async () => {
    let revision = 1
    let root = '/old'
    let release!: () => void
    const getEntries = vi
      .fn<() => Promise<FsEntry[]>>()
      .mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(entries))))
      .mockResolvedValueOnce([{ kind: 'file', name: 'new.md', path: 'new.md' }])
    const service = new WorkspaceTreeQueryService({
      getEntries,
      getRevision: () => revision,
      getGeneration: () => revision,
      getRoot: () => ({ kind: 'external', path: root }),
    })

    const resultPromise = service.listChildren({ parent: null })
    revision = 2
    root = '/new'
    release()

    await expect(resultPromise).resolves.toMatchObject({
      entries: [{ path: 'new.md' }],
      revision: 2,
      root: { path: '/new' },
    })
    expect(getEntries).toHaveBeenCalledTimes(2)
  })

  it('retries an in-flight query invalidated by a synchronous mutation epoch', async () => {
    let release!: () => void
    const getEntries = vi
      .fn<() => Promise<FsEntry[]>>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = () => resolve([{ kind: 'file', name: 'old.md', path: 'old.md' }])
          }),
      )
      .mockResolvedValueOnce([{ kind: 'file', name: 'new.md', path: 'new.md' }])
    const service = new WorkspaceTreeQueryService({
      getEntries,
      getGeneration: () => 1,
      getRevision: () => 1,
      getRoot: () => ({ kind: 'external', path: '/workspace' }),
    })

    const pending = service.listChildren({ parent: null })
    service.invalidate()
    release()

    await expect(pending).resolves.toMatchObject({ entries: [{ path: 'new.md' }] })
    expect(getEntries).toHaveBeenCalledTimes(2)
  })

  it('returns a bounded deep search from the revision index', async () => {
    const getEntries = vi.fn(async () =>
      Array.from({ length: 20_000 }, (_, index) => ({
        kind: 'file' as const,
        name: `note-${index}.md`,
        path: `deep/folder/note-${index}.md`,
      })),
    )
    const service = new WorkspaceTreeQueryService({
      getEntries,
      getGeneration: () => 8,
      getRevision: () => 12,
      getRoot: () => ({ kind: 'external', path: '/large' }),
    })

    const result = await service.search({ query: 'note-', limit: 100 })

    expect(result.entries).toHaveLength(100)
    expect(result).toMatchObject({ generation: 8, revision: 12 })
    expect(getEntries).toHaveBeenCalledOnce()
  })
})
