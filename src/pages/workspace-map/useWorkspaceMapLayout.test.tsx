import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GraphData } from '@/logic/graph'
import type { FitViewOptions } from '@xyflow/react'
import { useWorkspaceMapLayout } from '@/pages/workspace-map/useWorkspaceMapLayout'
import { layoutGraphWithElk } from '@/logic/graphLayout'

vi.mock('@/logic/graphLayout', () => ({
  layoutGraphWithElk: vi.fn(async (nodes) => nodes),
}))

const createGraph = (activePath: string | null, value = ''): GraphData => ({
  nodes: ['notes/a.md', 'notes/b.md'].map((path) => ({
    id: `file:${path}`,
    type: 'file',
    data: {
      label: path,
      path,
      workspaceMapEditor:
        path === activePath
          ? {
              active: true,
              loadState: { status: 'ready' as const, content: value },
              onChange: vi.fn(),
              onClose: vi.fn(),
              onOpenFull: vi.fn(),
              onRetry: vi.fn(),
              readOnly: false,
            }
          : undefined,
    },
    position: { x: 0, y: 0 },
  })),
  edges: [],
  layoutKey: `map:editor:${activePath ?? ''}`,
})

describe('useWorkspaceMapLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
  })

  it('relayouts once per active path and fits only the active editor node', async () => {
    const fitView = vi.fn<(options: FitViewOptions) => Promise<boolean>>().mockResolvedValue(true)
    const setNodes = vi.fn()
    const { rerender } = renderHook(
      ({ activePath, graph }) =>
        useWorkspaceMapLayout({
          activePath,
          flow: { fitView } as never,
          graph,
          setNodes,
        }),
      {
        initialProps: {
          activePath: 'notes/a.md' as string | null,
          graph: createGraph('notes/a.md'),
        },
      },
    )

    await waitFor(() => expect(fitView).toHaveBeenCalledOnce())
    expect(fitView.mock.calls[0]?.[0].nodes?.[0]?.id).toBe('file:notes/a.md')

    rerender({ activePath: 'notes/a.md', graph: createGraph('notes/a.md', 'typed') })
    expect(layoutGraphWithElk).toHaveBeenCalledOnce()

    rerender({ activePath: 'notes/b.md', graph: createGraph('notes/b.md') })
    await waitFor(() => expect(layoutGraphWithElk).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(fitView).toHaveBeenCalledTimes(2))
    expect(fitView.mock.calls[1]?.[0].nodes?.[0]?.id).toBe('file:notes/b.md')
  })
})
