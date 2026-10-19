import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const flow = vi.hoisted(() => ({
  fitView: vi.fn(),
  getEdges: vi.fn<() => Array<{ source: string; target: string; hidden?: boolean }>>(() => []),
  getNode: vi.fn(),
  getNodes: vi.fn<() => Array<{ id: string }>>(() => []),
  updateNode: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({ useReactFlow: () => flow }))

import { useWorkspaceMapNodeTools } from '@/pages/workspace-map/useWorkspaceMapNodeTools'

describe('useWorkspaceMapNodeTools', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps relation focusing available when overview edges use hidden presentation copies', () => {
    flow.getEdges.mockReturnValue([
      { source: 'a', target: 'b', hidden: true },
      { source: 'c', target: 'a', hidden: true },
    ])
    flow.getNodes.mockReturnValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'unrelated' }])
    const { result } = renderHook(() => useWorkspaceMapNodeTools('a', false))
    act(() => result.current.focusRelations())
    expect(flow.fitView).toHaveBeenCalledWith({
      duration: 180,
      maxZoom: 1.15,
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      padding: 0.28,
    })
  })

  it('uses node data as the controlled pin state after external updates', () => {
    flow.getNode.mockReturnValue({ data: { label: 'A', workspaceMapPinned: true } })
    const { result, rerender } = renderHook(
      ({ pinned }) => useWorkspaceMapNodeTools('file:notes/a.md', pinned),
      { initialProps: { pinned: false } },
    )

    rerender({ pinned: true })
    expect(result.current.pinned).toBe(true)

    act(() => result.current.togglePinned())
    expect(flow.updateNode).toHaveBeenCalledWith('file:notes/a.md', {
      data: { label: 'A', workspaceMapPinned: false },
      draggable: true,
    })
  })
})
