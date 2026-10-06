import { describe, expect, it } from 'vitest'

import type { GraphData } from '@/logic/graph'
import {
  applyStoredWorkspaceMapLayout,
  createWorkspaceMapLayoutSave,
  resetWorkspaceMapUserPositions,
} from '@/pages/workspace-map/workspaceMapLayoutPersistence'

const nodes = (): GraphData['nodes'] => [
  {
    data: { label: 'A' },
    height: 240,
    id: 'file:a.md',
    position: { x: 0, y: 0 },
    width: 360,
  },
]

const storedNode = {
  collapsed: true,
  height: 420,
  id: 'file:a.md',
  pinned: true,
  userModified: true,
  width: 640,
  x: 100,
  y: 200,
}

describe('workspace map layout persistence', () => {
  it('restores exact geometry and stable interaction state', () => {
    const restored = applyStoredWorkspaceMapLayout(nodes(), {
      match: 'exact',
      nodes: [storedNode],
      viewport: null,
    })

    expect(restored[0]).toMatchObject({
      data: {
        workspaceMapPersistedCollapsed: true,
        workspaceMapPinned: true,
        workspaceMapUserModified: true,
      },
      height: 420,
      position: { x: 100, y: 200 },
      style: { height: 420, width: 640 },
      width: 640,
    })
  })

  it('merges only user geometry on a stale graph while preserving disclosure and pin state', () => {
    const automatic = { ...storedNode, id: 'file:a.md', userModified: false }
    const restored = applyStoredWorkspaceMapLayout(nodes(), {
      match: 'stale',
      nodes: [automatic],
      viewport: null,
    })

    expect(restored[0]).toMatchObject({
      data: { workspaceMapPersistedCollapsed: true, workspaceMapPinned: true },
      height: 240,
      position: { x: 0, y: 0 },
      width: 360,
    })
  })

  it('serializes disclosure, pin, viewport, and bounded node geometry', () => {
    const value = createWorkspaceMapLayoutSave(
      {
        engineVersion: 'elk-workspace-map-v1',
        graphRevision: 'revision-a',
        layoutKey: 'workspace-map:overview',
        mode: 'overview',
      },
      [
        {
          ...nodes()[0],
          height: 420,
          data: {
            label: 'A',
            workspaceMapDisclosure: { collapsed: true, toggle: () => undefined },
            workspaceMapPinned: true,
            workspaceMapUserModified: true,
          },
          position: { x: 100, y: 200 },
          width: 640,
        },
      ],
      { x: 1, y: 2, zoom: 1.2 },
    )

    expect(value.nodes[0]).toEqual(storedNode)
    expect(value.viewport).toEqual({ x: 1, y: 2, zoom: 1.2 })
  })

  it('arrange clears user positions without discarding pin, disclosure, or size', () => {
    const arranged = resetWorkspaceMapUserPositions(
      applyStoredWorkspaceMapLayout(nodes(), {
        match: 'exact',
        nodes: [storedNode],
        viewport: null,
      }),
    )

    expect(arranged[0]).toMatchObject({
      data: {
        workspaceMapPersistedCollapsed: true,
        workspaceMapPinned: true,
        workspaceMapUserModified: false,
      },
      height: 420,
      width: 640,
    })
  })
})
