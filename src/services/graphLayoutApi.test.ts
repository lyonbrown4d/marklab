import { describe, expect, it, vi } from 'vitest'

import { graphLayoutApi } from '@/services/graphLayoutApi'
import { invoke } from '@/runtime/ipc'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

describe('graphLayoutApi', () => {
  it('invokes the typed graph layout commands and validates the response', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ match: 'miss', nodes: [], viewport: null })
    const request = {
      engineVersion: 'elk-workspace-map-v1',
      graphRevision: 'revision-a',
      layoutKey: 'workspace-map:overview',
      mode: 'overview' as const,
    }

    await expect(graphLayoutApi.get(request)).resolves.toEqual({
      match: 'miss',
      nodes: [],
      viewport: null,
    })
    expect(invoke).toHaveBeenCalledWith('fs_get_workspace_graph_layout', request)
  })

  it('rejects malformed main-process responses', async () => {
    vi.mocked(invoke).mockResolvedValueOnce({ match: 'exact', nodes: [{ id: 'unsafe' }] })

    await expect(
      graphLayoutApi.get({
        engineVersion: 'elk-workspace-map-v1',
        graphRevision: 'revision-a',
        layoutKey: 'workspace-map:overview',
        mode: 'overview',
      }),
    ).rejects.toThrow()
  })

  it('validates and sends a bounded layout save', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(undefined)
    const value = {
      engineVersion: 'elk-workspace-map-v1',
      graphRevision: 'revision-a',
      layoutKey: 'workspace-map:overview',
      mode: 'overview' as const,
      nodes: [
        {
          collapsed: false,
          height: 240,
          id: 'file:a.md',
          pinned: false,
          userModified: true,
          width: 360,
          x: 10,
          y: 20,
        },
      ],
      viewport: null,
    }

    await graphLayoutApi.save(value)

    expect(invoke).toHaveBeenCalledWith('fs_save_workspace_graph_layout', value)
  })

  it('rejects non-finite saved layout values', async () => {
    vi.mocked(invoke).mockClear()

    await expect(
      graphLayoutApi.save({
        engineVersion: 'elk-workspace-map-v1',
        graphRevision: 'revision-a',
        layoutKey: 'workspace-map:overview',
        mode: 'overview',
        nodes: [
          {
            collapsed: false,
            height: 240,
            id: 'file:a.md',
            pinned: false,
            userModified: true,
            width: 360,
            x: Number.POSITIVE_INFINITY,
            y: 20,
          },
        ],
        viewport: null,
      }),
    ).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })
})
