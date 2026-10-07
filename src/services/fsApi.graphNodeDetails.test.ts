import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

describe('fsApi graph node details', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it('uses the bounded node-details command and validates its response', async () => {
    const request = {
      mode: 'summary' as const,
      node_ids: ['file:notes/a.md'],
      max_nodes: 1,
      revision: 'revision-3',
    }
    vi.mocked(invoke).mockResolvedValue({
      items: [{ id: 'file:notes/a.md', content: 'Summary' }],
      revision: 'revision-3',
      truncated: false,
    })

    await expect(fsApi.getWorkspaceGraphNodeDetails(request)).resolves.toMatchObject({
      items: [{ id: 'file:notes/a.md', content: 'Summary' }],
    })
    expect(invoke).toHaveBeenCalledWith('fs_get_workspace_graph_node_details', request)
  })
})
