import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { createRef, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Edge, Node } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { buildMindmapModel } from '@/pages/graph/mindmapModel'
import { useMindmapInteractions } from '@/pages/graph/useMindmapInteractions'

const nodes: Node<GraphNodeData>[] = [
  {
    id: 'root',
    type: 'heading',
    data: { label: 'Root', line: 1 },
    position: { x: 0, y: 0 },
  },
  {
    id: 'child',
    type: 'heading',
    data: { label: 'Child', line: 2 },
    position: { x: 220, y: 0 },
  },
]
const edges: Edge[] = [
  { id: 'root-child', source: 'root', target: 'child', data: { kind: 'contains' } },
]

describe('useMindmapInteractions', () => {
  it('keeps ReactFlow-facing callbacks stable across equivalent parent renders', () => {
    const shellRef = createRef<HTMLDivElement>()
    const model = buildMindmapModel(nodes, edges)
    const stable = {
      addChild: vi.fn(() => null),
      addSibling: vi.fn(() => null),
      deleteHeading: vi.fn(() => null),
      select: vi.fn(),
      setCollapsedIds: vi.fn(),
    }
    const { result, rerender } = renderHook(() =>
      useMindmapInteractions({
        ...stable,
        collapsedIds: new Set(),
        editable: true,
        flowInstance: null,
        model,
        nodes,
        selectedId: 'root',
        shellRef,
      }),
    )
    const first = result.current
    rerender()

    expect(result.current.addChild).toBe(first.addChild)
    expect(result.current.addSibling).toBe(first.addSibling)
    expect(result.current.toggleFold).toBe(first.toggleFold)
  })

  it('executes fold, reorder, history, and title-edit commands from the canvas', () => {
    const reorder = vi.fn(() => true)
    const undo = vi.fn(() => true)
    const addSibling = vi.fn(() => null)

    const Harness = () => {
      const shellRef = useRef<HTMLDivElement | null>(null)
      const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
      useMindmapInteractions({
        addChild: vi.fn(() => null),
        addSibling,
        collapsedIds,
        deleteHeading: vi.fn(() => null),
        editable: true,
        flowInstance: null,
        model: buildMindmapModel(nodes, edges),
        nodes,
        reorder,
        select: vi.fn(),
        selectedId: 'root',
        setCollapsedIds,
        shellRef,
        undo,
      })
      return (
        <div ref={shellRef} data-testid="canvas" data-collapsed={collapsedIds.has('root')}>
          <div data-graph-node-id="root">
            <div
              contentEditable="plaintext-only"
              data-markdown-block-role="title"
              suppressContentEditableWarning
            >
              Root
            </div>
          </div>
        </div>
      )
    }

    render(<Harness />)
    const canvas = screen.getByTestId('canvas')
    fireEvent.keyDown(canvas, { key: '/', ctrlKey: true })
    expect(canvas).toHaveAttribute('data-collapsed', 'true')
    fireEvent.keyDown(canvas, { key: 'ArrowDown', altKey: true })
    expect(reorder).toHaveBeenCalledWith('root', 'down')
    fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true })
    expect(undo).toHaveBeenCalled()
    fireEvent.keyDown(canvas, { key: 'F2' })
    expect(document.activeElement).toHaveAttribute('data-markdown-block-role', 'title')

    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(addSibling).not.toHaveBeenCalled()
  })
})
