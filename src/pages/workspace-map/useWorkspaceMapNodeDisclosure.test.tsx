import { act, renderHook, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import type { GraphData } from '@/logic/graph'
import { useWorkspaceMapNodeDisclosure } from '@/pages/workspace-map/useWorkspaceMapNodeDisclosure'

const graphNodes: GraphData['nodes'] = [
  {
    id: 'file:notes/a.md',
    type: 'file',
    data: { label: 'A', path: 'notes/a.md' },
    height: 640,
    measured: { height: 640, width: 520 },
    width: 520,
    position: { x: 0, y: 0 },
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

const useHarness = (activePath: string | null) => {
  const [nodes, setNodes] = useState(graphNodes)
  return useWorkspaceMapNodeDisclosure({ activePath, nodes, setNodes })
}

describe('useWorkspaceMapNodeDisclosure', () => {
  it('collapses rich content geometry and restores it when expanded', () => {
    const { result } = renderHook(() => useHarness(null))
    const disclosure = result.current.nodes[0]?.data.workspaceMapDisclosure

    act(() => disclosure?.toggle('file:notes/a.md'))

    expect(result.current.nodes[0]).toMatchObject({
      height: 72,
      measured: { height: 72, width: 220 },
      width: 220,
    })
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure?.collapsed).toBe(true)

    act(() => result.current.nodes[0]?.data.workspaceMapDisclosure?.toggle('file:notes/a.md'))

    expect(result.current.nodes[0]).toMatchObject({
      height: 640,
      measured: { height: 640, width: 520 },
      width: 520,
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

    await waitFor(() => expect(result.current.nodes[0]).toMatchObject({ height: 640, width: 520 }))
    expect(result.current.nodes[0]?.data.workspaceMapDisclosure).toBeUndefined()
  })

  it('does not offer collapse while the native web view is active', () => {
    const { result } = renderHook(() => useHarness(null))

    expect(result.current.nodes[1]?.data.workspaceMapDisclosure).toBeUndefined()
  })
})
