import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'
import type { GraphData } from '@/logic/graph'
import type { GraphNodeData } from '@/logic/graph'
import { useWorkspaceMapNodeDisclosure } from '@/pages/workspace-map/useWorkspaceMapNodeDisclosure'

const graphNodes: GraphData['nodes'] = [
  {
    id: 'file:notes/a.md',
    type: 'file',
    data: { label: 'A', path: 'notes/a.md' },
    height: 112,
    measured: { height: 112, width: 248 },
    width: 248,
    position: { x: 0, y: 0 },
  },
  {
    id: 'file:notes/b.md',
    type: 'file',
    data: { label: 'B', path: 'notes/b.md' },
    height: 112,
    measured: { height: 112, width: 248 },
    width: 248,
    position: { x: 560, y: 0 },
  },
  {
    id: 'ext:https://example.com',
    type: 'external',
    data: {
      label: 'Example',
      url: 'https://example.com',
      webView: { active: true, activate: () => undefined, deactivate: () => undefined },
    },
    height: 220,
    measured: { height: 220, width: 360 },
    width: 360,
    position: { x: 600, y: 0 },
  },
]

const useHarness = (
  activePath: string | null,
  defaultCollapsed = false,
  graphIdentity = 'workspace:a',
) => {
  const [nodes, setNodes] = useState(graphNodes)
  const disclosure = useWorkspaceMapNodeDisclosure({
    activePath,
    defaultCollapsed,
    graphIdentity,
    nodes,
    setNodes,
  })
  return { ...disclosure, setNodes }
}

describe('useWorkspaceMapNodeDisclosure', () => {
  it('collapses rich content geometry and restores it when expanded', () => {
    const { result } = renderHook(() => useHarness(null))
    const disclosure = result.current.nodes[0]?.data.workspaceMapDisclosure

    act(() => disclosure?.toggle('file:notes/a.md'))

    expect(result.current.nodes[0]).toMatchObject({
      height: 112,
      measured: { height: 112, width: 248 },
      width: 248,
    })
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(true)

    act(() => result.current.nodes[0]?.data.workspaceMapDisclosure?.toggle('file:notes/a.md'))

    expect(result.current.nodes[0]).toMatchObject({
      height: 112,
      measured: { height: 112, width: 248 },
      width: 248,
    })
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(false)
  })

  it('automatically expands an activated document and removes its collapse action', async () => {
    const { result, rerender } = renderHook(({ activePath }) => useHarness(activePath), {
      initialProps: { activePath: null as string | null },
    })

    act(() => result.current.nodes[0]?.data.workspaceMapDisclosure?.toggle('file:notes/a.md'))
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(true)

    rerender({ activePath: 'notes/a.md' })

    await waitFor(() => expect(result.current.nodes[0]).toMatchObject({ height: 480, width: 420 }))
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure).toBeUndefined()
  })

  it('restores resized editor geometry after compacting an inactive document', async () => {
    const { result, rerender } = renderHook(({ activePath }) => useHarness(activePath, true), {
      initialProps: { activePath: 'notes/a.md' as string | null },
    })

    await waitFor(() => expect(result.current.nodes[0]).toMatchObject({ height: 480, width: 420 }))
    act(() =>
      result.current.setNodes((current) =>
        current.map((node) =>
          node.id === 'file:notes/a.md'
            ? ({
                ...node,
                height: 620,
                measured: { height: 620, width: 760 },
                style: { ...node.style, height: 620, width: 760 },
                width: 760,
              } satisfies Node<GraphNodeData>)
            : node,
        ),
      ),
    )

    await waitFor(() => expect(result.current.nodes[0]).toMatchObject({ height: 620, width: 760 }))

    rerender({ activePath: null })
    expect(result.current.nodes[0]).toMatchObject({ height: 112, width: 248 })

    rerender({ activePath: 'notes/a.md' })
    expect(result.current.nodes[0]).toMatchObject({ height: 620, width: 760 })
  })

  it('does not offer collapse while the native web view is active', () => {
    const { result } = renderHook(() => useHarness(null))

    expect(result.current.nodes[2]?.data.workspaceMapDisclosure).toBeUndefined()
  })

  it('collapses every rich node when a stable graph crosses the compact threshold', async () => {
    const { result, rerender } = renderHook(
      ({ compact }) => useHarness(null, compact, 'workspace:a'),
      { initialProps: { compact: false } },
    )
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(false)

    rerender({ compact: true })

    await waitFor(() => {
      expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(true)
      expect(result.current.nodes[1]?.data.workspaceMapDisclosure?.collapsed).toBe(true)
    })
  })

  it('resets default disclosure for a new workspace but preserves expansion in one workspace', async () => {
    const { result, rerender } = renderHook(({ identity }) => useHarness(null, true, identity), {
      initialProps: { identity: 'workspace:a' },
    })
    act(() => result.current.nodes[0]?.data.workspaceMapDisclosure?.toggle('file:notes/a.md'))
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(false)

    rerender({ identity: 'workspace:a' })
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(false)

    rerender({ identity: 'workspace:b' })
    await waitFor(() =>
      expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(true),
    )
  })

  it('keeps unaffected node references stable when another node is toggled', () => {
    const { result } = renderHook(() => useHarness(null))
    const unaffected = result.current.nodes[1]

    act(() => result.current.nodes[0]?.data.workspaceMapDisclosure?.toggle('file:notes/a.md'))

    expect(result.current.nodes[1]).toBe(unaffected)
  })
})
