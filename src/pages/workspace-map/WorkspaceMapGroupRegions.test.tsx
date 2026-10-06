import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { WorkspaceMapGroupRegions } from '@/pages/workspace-map/WorkspaceMapGroupRegions'

vi.mock('@xyflow/react', async (importOriginal) => {
  const original = await importOriginal<typeof import('@xyflow/react')>()
  return { ...original, ViewportPortal: ({ children }: { children: React.ReactNode }) => children }
})

const groupedNode = (id: string, x: number, dragging = false): Node<GraphNodeData> => ({
  id,
  type: 'file',
  data: {
    label: id,
    workspaceGroup: { key: 'docs', label: 'Docs', source: 'semantic' },
  },
  dragging,
  height: 100,
  position: { x, y: 20 },
  width: 200,
})

describe('WorkspaceMapGroupRegions', () => {
  it('keeps the last settled group geometry while a member node is being dragged', () => {
    const view = render(
      <WorkspaceMapGroupRegions nodes={[groupedNode('one', 100), groupedNode('two', 400)]} />,
    )
    const region = screen.getByTestId('workspace-map-group-docs')
    const settledStyle = region.getAttribute('style')

    view.rerender(
      <WorkspaceMapGroupRegions
        nodes={[groupedNode('one', -20_000, true), groupedNode('two', 400)]}
      />,
    )

    expect(region.getAttribute('style')).toBe(settledStyle)
  })
})
