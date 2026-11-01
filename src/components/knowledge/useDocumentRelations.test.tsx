import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsGraph } from '@/services/fsApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { useDocumentRelations } from '@/components/knowledge/useDocumentRelations'

const { getWorkspaceGraph } = vi.hoisted(() => ({ getWorkspaceGraph: vi.fn() }))
vi.mock('@/services/fsApi', () => ({ fsApi: { getWorkspaceGraph } }))

const graph = (path: string): FsGraph => ({
  mode: 'relations',
  revision: 'r1',
  topology_key: path,
  truncated: false,
  total_nodes: 1,
  total_edges: 0,
  nodes: [
    {
      id: `file:${path}`,
      kind: 'file',
      path,
      label: path,
      group: { key: '', label: '', source: 'path' },
    },
  ],
  edges: [],
})
const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

beforeEach(() => {
  useWorkspaceStore.setState({ rootKind: 'internal', rootPath: '/one' })
  getWorkspaceGraph
    .mockReset()
    .mockImplementation(async (request: { center_path: string }) => graph(request.center_path))
})

describe('document relation requests', () => {
  it('follows the document, pins its center, and updates the bounded neighbourhood controls', async () => {
    const { result, rerender } = renderHook(
      ({ path }) => useDocumentRelations('internal:/one', path),
      { initialProps: { path: 'a.md' }, wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.query.data?.nodes[0]?.path).toBe('a.md'))
    rerender({ path: 'b.md' })
    await waitFor(() => expect(result.current.query.data?.nodes[0]?.path).toBe('b.md'))
    act(() => result.current.togglePinned())
    rerender({ path: 'c.md' })
    expect(result.current.centerPath).toBe('b.md')
    act(() => {
      result.current.setDepth(2)
      result.current.setDirection('incoming')
    })
    await waitFor(() =>
      expect(getWorkspaceGraph).toHaveBeenLastCalledWith({
        center_path: 'b.md',
        depth: 2,
        direction: 'incoming',
        include_attachments: true,
        include_missing: true,
        max_nodes: 120,
        max_edges: 240,
      }),
    )
    act(() => result.current.togglePinned())
    await waitFor(() => expect(result.current.query.data?.nodes[0]?.path).toBe('c.md'))
  })

  it('isolates late results and pinned centers when the workspace changes', async () => {
    let resolveOld: (value: FsGraph) => void = () => undefined
    getWorkspaceGraph.mockImplementationOnce(
      () =>
        new Promise<FsGraph>((resolve) => {
          resolveOld = resolve
        }),
    )
    const { result, rerender } = renderHook(
      ({ workspaceKey, path }) => useDocumentRelations(workspaceKey, path),
      { initialProps: { workspaceKey: 'internal:/one', path: 'old.md' }, wrapper: wrapper() },
    )
    await waitFor(() => expect(getWorkspaceGraph).toHaveBeenCalled())
    act(() => result.current.togglePinned())
    act(() => useWorkspaceStore.setState({ rootPath: '/two' }))
    rerender({ workspaceKey: 'internal:/two', path: 'new.md' })
    await waitFor(() => expect(result.current.query.data?.nodes[0]?.path).toBe('new.md'))
    await act(async () => resolveOld(graph('old.md')))
    expect(result.current.query.data?.nodes[0]?.path).toBe('new.md')
    expect(result.current.pinned).toBe(false)
  })
})
