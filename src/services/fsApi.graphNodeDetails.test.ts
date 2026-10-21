import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { fsApi } from '@/services/fsApi'

// Native responses stay unknown so malformed-payload cases exercise runtime validation.
const nativeIpc = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/runtime/ipc', () => nativeIpc)

describe('fsApi graph node details', () => {
  beforeEach(() => nativeIpc.invoke.mockReset())

  it('uses the bounded node-details command and validates its response', async () => {
    const request = {
      mode: 'summary' as const,
      node_ids: ['file:notes/a.md'],
      max_nodes: 1,
      revision: 'revision-3',
    }
    nativeIpc.invoke.mockResolvedValue({
      items: [
        {
          id: 'file:notes/a.md',
          content: 'Summary',
          preview: {
            html: '<p>Summary</p>',
            math: [{ id: 'graph-math-0', expression: 'x^2', displayMode: false }],
          },
        },
      ],
      revision: 'revision-3',
      truncated: false,
    })

    await expect(fsApi.getWorkspaceGraphNodeDetails(request)).resolves.toMatchObject({
      items: [
        {
          id: 'file:notes/a.md',
          content: 'Summary',
          preview: {
            html: '<p>Summary</p>',
            math: [{ id: 'graph-math-0', expression: 'x^2', displayMode: false }],
          },
        },
      ],
    })
    expect(invoke).toHaveBeenCalledWith('fs_get_workspace_graph_node_details', request)
  })

  it('rejects oversized or malformed native preview payloads', async () => {
    const request = { mode: 'summary' as const, node_ids: ['file:a.md'], revision: 'r1' }
    for (const preview of [
      { html: 'x'.repeat(32_769), math: [] },
      { html: '<p>x</p>', math: [{ id: '" onclick="bad', expression: 'x', displayMode: false }] },
      {
        html: '<p>x</p>',
        math: [{ id: 'graph-math-0', expression: 'x'.repeat(1_681), displayMode: false }],
      },
      {
        html: '<p>x</p>',
        math: Array.from({ length: 65 }, () => ({
          id: 'graph-math-0',
          expression: 'x',
          displayMode: false,
        })),
      },
    ]) {
      nativeIpc.invoke.mockResolvedValue({
        items: [{ id: 'file:a.md', content: 'x', preview }],
        revision: 'r1',
        truncated: false,
      })
      await expect(fsApi.getWorkspaceGraphNodeDetails(request)).rejects.toThrow()
    }
  })

  it('accepts older node details without a preview for escaped text fallback', async () => {
    nativeIpc.invoke.mockResolvedValue({
      items: [{ id: 'file:a.md', content: '**Legacy**' }],
      revision: 'r1',
      truncated: false,
    })
    await expect(
      fsApi.getWorkspaceGraphNodeDetails({
        mode: 'summary',
        node_ids: ['file:a.md'],
        revision: 'r1',
      }),
    ).resolves.toMatchObject({
      items: [{ content: '**Legacy**', preview: { html: '', math: [] } }],
    })
  })
})
