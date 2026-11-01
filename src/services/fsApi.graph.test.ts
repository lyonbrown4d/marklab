import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fsApi, type WorkspaceGraphRequest } from '@/services/fsApi'

const nativeIpc = vi.hoisted(() => ({
  invoke: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}))
vi.mock('@/runtime/ipc', () => nativeIpc)

const request: WorkspaceGraphRequest = {
  center_path: 'a.md',
  depth: 1,
  direction: 'outgoing',
  include_attachments: false,
  include_missing: true,
  max_nodes: 20,
  max_edges: 40,
}

const graph = () => ({
  mode: 'relations',
  revision: 'r1',
  topology_key: 'topology-1',
  truncated: false,
  total_nodes: 2,
  total_edges: 1,
  nodes: ['a.md', 'b.md'].map((path) => ({
    id: `file:${path}`,
    kind: 'file',
    label: path,
    path,
    group: { key: 'Workspace', label: 'Workspace', source: 'path' },
  })),
  edges: [{ id: 'a-b', source: 'file:a.md', target: 'file:b.md', kind: 'links_to', count: 3 }],
})

describe('fsApi graph contract', () => {
  beforeEach(() => nativeIpc.invoke.mockReset())

  it('sends an explicit scoped request and preserves directed counts and topology metadata', async () => {
    nativeIpc.invoke.mockResolvedValue(graph())
    await expect(fsApi.getWorkspaceGraph(request)).resolves.toEqual(graph())
    expect(nativeIpc.invoke).toHaveBeenCalledWith('fs_get_workspace_graph', request)
  })

  it('rejects unsafe document paths and invalid workload bounds before invoking native code', async () => {
    for (const center_path of ['../a.md', '/a.md', 'C:/a.md', 'a\\b.md', 'a/./b.md', 'a.md\0']) {
      await expect(fsApi.getWorkspaceGraph({ ...request, center_path })).rejects.toThrow()
    }
    await expect(fsApi.getWorkspaceGraph({ ...request, max_nodes: 10_001 })).rejects.toThrow()
    await expect(fsApi.getWorkspaceGraph({ ...request, max_edges: 0 })).rejects.toThrow()
    expect(nativeIpc.invoke).not.toHaveBeenCalled()
  })

  it('rejects obsolete graph mode, missing endpoints, duplicate nodes, and invalid relation counts', async () => {
    const valid = graph()
    for (const payload of [
      { ...valid, mode: 'mindmap' },
      { ...valid, nodes: valid.nodes.slice(0, 1) },
      { ...valid, nodes: [valid.nodes[0], valid.nodes[0]] },
      { ...valid, edges: [{ ...valid.edges[0], count: 0 }] },
      { ...valid, total_nodes: 0 },
    ]) {
      nativeIpc.invoke.mockResolvedValue(payload)
      await expect(fsApi.getWorkspaceGraph(request)).rejects.toThrow()
    }
  })
})
