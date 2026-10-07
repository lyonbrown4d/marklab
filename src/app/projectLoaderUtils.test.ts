import { beforeEach, describe, expect, it, vi } from 'vitest'

import { areWorkspaceEntriesEqual, fetchWorkspaceTreeChildrenPage } from '@/app/projectLoaderUtils'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'

vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { listChildren: vi.fn() },
}))

beforeEach(() => vi.clearAllMocks())

describe('fetchWorkspaceTreeChildrenPage', () => {
  it('loads only one bounded page for incremental rendering', async () => {
    vi.mocked(workspaceTreeApi.listChildren)
      .mockResolvedValueOnce({
        entries: [{ kind: 'folder', name: 'docs', path: 'docs', hasChildren: true }],
        nextCursor: '3:1',
        parent: '',
        generation: 1,
        revision: 3,
        root: { kind: 'external', path: '/workspace' },
      })
      .mockResolvedValueOnce({
        entries: [{ kind: 'file', name: 'home.md', path: 'home.md', hasChildren: false }],
        nextCursor: null,
        parent: '',
        generation: 1,
        revision: 3,
        root: { kind: 'external', path: '/workspace' },
      })

    await expect(fetchWorkspaceTreeChildrenPage(null)).resolves.toMatchObject({
      entries: [{ path: 'docs' }],
      revision: 3,
    })
    expect(workspaceTreeApi.listChildren).toHaveBeenNthCalledWith(1, {
      cursor: null,
      limit: 256,
      parent: null,
    })
    expect(workspaceTreeApi.listChildren).toHaveBeenCalledOnce()
  })
})

describe('areWorkspaceEntriesEqual', () => {
  it('observes lazy-folder metadata changes', () => {
    const unloaded = [
      { kind: 'folder' as const, path: 'docs', hasChildren: true, childrenLoaded: false },
    ]
    expect(areWorkspaceEntriesEqual(unloaded, [{ ...unloaded[0], childrenLoaded: true }])).toBe(
      false,
    )
    expect(areWorkspaceEntriesEqual(unloaded, [{ ...unloaded[0], hasChildren: false }])).toBe(false)
  })
})
