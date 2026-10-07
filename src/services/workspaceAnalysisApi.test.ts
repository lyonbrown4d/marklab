import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

const invokeMock = vi.mocked(invoke)

describe('workspaceAnalysisApi', () => {
  beforeEach(() => invokeMock.mockReset())

  it('sends a bounded navigation query and validates its response', async () => {
    invokeMock.mockResolvedValue({
      ready: true,
      revision: 3,
      active_path: 'notes/current.md',
      files: [{ path: 'notes/guide.md', title: 'Guide' }],
      headings: [{ path: 'notes/guide.md', slug: 'intro', text: 'Introduction', level: 2 }],
      file_total: 1,
      heading_total: 1,
      current: {
        headings: [],
        outgoing_links: [],
        backlinks: [],
        missing_links: [],
        heading_total: 0,
        outgoing_link_total: 0,
        backlink_total: 0,
        missing_link_total: 0,
      },
      limit: 24,
    })

    await expect(
      workspaceAnalysisApi.queryNavigation({
        active_path: 'notes/current.md',
        query: 'intro',
        scope: 'headings',
        limit: 24,
      }),
    ).resolves.toMatchObject({ revision: 3, heading_total: 1 })
    expect(invokeMock).toHaveBeenCalledWith('fs_query_workspace_navigation', {
      active_path: 'notes/current.md',
      query: 'intro',
      scope: 'headings',
      limit: 24,
    })
  })

  it('rejects malformed navigation payloads', async () => {
    invokeMock.mockResolvedValue({ ready: true, revision: 'stale' })

    await expect(workspaceAnalysisApi.queryNavigation({ limit: 20 })).rejects.toThrow()
  })

  it('validates the bounded workspace knowledge summary', async () => {
    invokeMock.mockResolvedValue({
      ready: true,
      revision: 7,
      file_count: 12,
      heading_count: 30,
      internal_link_count: 18,
      linked_file_count: 9,
      missing_link_count: 2,
      orphan_file_count: 3,
      collection_counts: {
        all: 12,
        'needs-attention': 2,
        linked: 9,
        structured: 4,
      },
    })

    await expect(workspaceAnalysisApi.getKnowledgeSummary()).resolves.toMatchObject({
      file_count: 12,
      orphan_file_count: 3,
      collection_counts: { all: 12, 'needs-attention': 2, linked: 9, structured: 4 },
    })
    expect(invokeMock).toHaveBeenCalledWith('fs_get_workspace_knowledge_summary')
  })

  it('queries workspace pages through bounded chunks', async () => {
    invokeMock
      .mockResolvedValueOnce({
        ready: true,
        revision: 2,
        items: Array.from({ length: 500 }, (_, index) => ({
          path: `notes/${index}.md`,
          title: `Note ${index}`,
          folder: 'notes',
          heading_count: 1,
          link_count: 0,
          asset_count: 0,
          issue_count: 0,
        })),
        folders: ['notes'],
        total: 501,
        offset: 0,
        limit: 500,
      })
      .mockResolvedValueOnce({
        ready: true,
        revision: 2,
        items: [
          {
            path: 'notes/500.md',
            title: 'Note 500',
            folder: 'notes',
            heading_count: 1,
            link_count: 0,
            asset_count: 0,
            issue_count: 0,
          },
        ],
        folders: ['notes'],
        total: 501,
        offset: 500,
        limit: 500,
      })

    const result = await workspaceAnalysisApi.queryAllPages({ query: 'note', sort: 'title' })

    expect(result.items).toHaveLength(501)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'fs_query_workspace_pages', {
      query: 'note',
      sort: 'title',
      offset: 0,
      limit: 500,
    })
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'fs_query_workspace_pages', {
      query: 'note',
      sort: 'title',
      offset: 500,
      limit: 500,
    })
  })

  it('rejects page batches from different index revisions', async () => {
    const page = (revision: number, offset: number, size: number) => ({
      ready: true,
      revision,
      items: Array.from({ length: size }, (_, index) => ({
        path: `notes/${offset + index}.md`,
        title: `Note ${offset + index}`,
        folder: 'notes',
        heading_count: 0,
        link_count: 0,
        asset_count: 0,
        issue_count: 0,
      })),
      folders: ['notes'],
      total: 501,
      offset,
      limit: 500,
    })
    invokeMock.mockResolvedValueOnce(page(1, 0, 500)).mockResolvedValueOnce(page(2, 500, 1))

    await expect(workspaceAnalysisApi.queryAllPages({})).rejects.toThrow(
      'Workspace page index changed',
    )
  })

  it('requests and validates bounded document insights', async () => {
    invokeMock.mockResolvedValue({
      ready: true,
      revision: 8,
      path: 'notes/current.md',
      found: true,
      headings: [],
      backlinks: [],
      diagnostics: [],
      asset_report: {
        current_assets: [],
        current_asset_count: 0,
        current_missing_count: 0,
        workspace_missing_assets: [],
        workspace_missing_count: 0,
        limit: 80,
      },
      knowledge: {
        incoming: [],
        outgoing: [],
        missing: [],
        incoming_count: 0,
        outgoing_count: 0,
        missing_count: 0,
        orphan: true,
      },
    })

    await expect(
      workspaceAnalysisApi.getDocumentInsights({ path: 'notes/current.md', asset_limit: 80 }),
    ).resolves.toMatchObject({ path: 'notes/current.md', revision: 8, found: true })
    expect(invokeMock).toHaveBeenCalledWith('fs_get_workspace_document_insights', {
      path: 'notes/current.md',
      asset_limit: 80,
    })
  })

  it('rejects malformed document insight payloads', async () => {
    invokeMock.mockResolvedValue({ ready: true, path: 'notes/current.md' })

    await expect(
      workspaceAnalysisApi.getDocumentInsights({ path: 'notes/current.md' }),
    ).rejects.toThrow()
  })
})
