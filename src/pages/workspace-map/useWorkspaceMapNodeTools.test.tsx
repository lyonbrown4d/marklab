import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const flow = vi.hoisted(() => ({
  fitView: vi.fn(),
  getEdges: vi.fn(() => []),
  getNode: vi.fn(),
  getNodes: vi.fn(() => []),
  updateNode: vi.fn(),
}))

vi.mock('@xyflow/react', () => ({ useReactFlow: () => flow }))

import { useWorkspaceMapNodeTools } from '@/pages/workspace-map/useWorkspaceMapNodeTools'

describe('useWorkspaceMapNodeTools', () => {
  beforeEach(() => vi.clearAllMocks())

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
