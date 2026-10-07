import { describe, expect, it, vi } from 'vitest'

import type { FsWorkspaceIndex } from '@electron/services/workspace/types'
import { WorkspaceIndexQueryService } from '@electron/services/workspace/workspaceIndexQueryService'

describe('WorkspaceIndexQueryService', () => {
  it('projects the cached index with the revision captured before loading', async () => {
    const index: FsWorkspaceIndex = {
      files: [{ path: 'note.md', headings: [], links: [], assets: [] }],
    }
    const load = vi.fn(async () => index)
    const getRevision = vi.fn(() => 4)
    const service = new WorkspaceIndexQueryService({ getRevision, load })

    await expect(service.workspaceKnowledgeSummary()).resolves.toMatchObject({
      revision: 4,
      file_count: 1,
    })
    expect(getRevision).toHaveBeenCalledBefore(load)
  })

  it('retries when the workspace changes while an index request is pending', async () => {
    let revision = 4
    let releaseFirst!: (value: FsWorkspaceIndex) => void
    const first = new Promise<FsWorkspaceIndex>((resolve) => {
      releaseFirst = resolve
    })
    const current: FsWorkspaceIndex = {
      files: [
        { path: 'current.md', headings: [], links: [], assets: [] },
        { path: 'second.md', headings: [], links: [], assets: [] },
      ],
    }
    const load = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(current)
    const service = new WorkspaceIndexQueryService({ getRevision: () => revision, load })

    const request = service.workspaceKnowledgeSummary()
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce())
    revision = 5
    releaseFirst({ files: [] })

    await expect(request).resolves.toMatchObject({ revision: 5, file_count: 2 })
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('reuses a prepared page projection across bounded page requests', async () => {
    const find = vi.fn(() => undefined)
    const index: FsWorkspaceIndex = {
      files: [{ path: 'a.md', headings: Object.assign([], { find }), links: [], assets: [] }],
    }
    const service = new WorkspaceIndexQueryService({
      getRevision: () => 2,
      load: async () => index,
    })

    await service.workspacePageQuery({ offset: 0, limit: 1 })
    await service.workspacePageQuery({ offset: 1, limit: 1 })

    expect(find).toHaveBeenCalledOnce()
  })
})
