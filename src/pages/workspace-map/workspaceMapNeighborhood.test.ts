import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import type { GraphNodeData } from '@/logic/graph'
import {
  createWorkspaceMapNeighborhood,
  presentWorkspaceMapNeighborhoodEdges,
  presentWorkspaceMapNeighborhoodNodes,
} from '@/pages/workspace-map/workspaceMapNeighborhood'

const nodes: Node<GraphNodeData>[] = ['a', 'b', 'c', 'd'].map((id) => ({
  id,
  className: id === 'a' ? 'existing-node-class' : undefined,
  data: { label: id },
  position: { x: 0, y: 0 },
}))

const edges: Edge[] = [
  { id: 'a-b', source: 'a', target: 'b', className: 'existing-edge-class' },
  { id: 'c-a', source: 'c', target: 'a' },
  { id: 'c-d', source: 'c', target: 'd' },
]

describe('workspace map neighborhood presentation', () => {
  it('finds direct neighbors and incident edges in either direction', () => {
    const neighborhood = createWorkspaceMapNeighborhood(edges, 'a')

    expect([...neighborhood.nodeIds]).toEqual(['a', 'b', 'c'])
    expect([...neighborhood.edgeIds]).toEqual(['a-b', 'c-a'])
  })

  it('emphasizes one-hop relations while preserving existing classes', () => {
    const neighborhood = createWorkspaceMapNeighborhood(edges, 'a')
    const presentedNodes = presentWorkspaceMapNeighborhoodNodes(nodes, neighborhood)
    const presentedEdges = presentWorkspaceMapNeighborhoodEdges(edges, neighborhood)

    expect(presentedNodes.find((node) => node.id === 'a')?.className).toContain(
      'workspace-map-flow-node--spotlight',
    )
    expect(presentedNodes.find((node) => node.id === 'a')?.className).toContain(
      'existing-node-class',
    )
    expect(presentedNodes.find((node) => node.id === 'b')?.className).toContain(
      'workspace-map-flow-node--neighbor',
    )
    expect(presentedNodes.find((node) => node.id === 'd')?.className).toContain(
      'workspace-map-flow-node--dimmed',
    )
    expect(presentedEdges.find((edge) => edge.id === 'a-b')?.className).toContain(
      'workspace-map-flow-edge--connected',
    )
    expect(presentedEdges.find((edge) => edge.id === 'a-b')?.className).toContain(
      'existing-edge-class',
    )
    expect(presentedEdges.find((edge) => edge.id === 'c-d')?.className).toContain(
      'workspace-map-flow-edge--muted',
    )
  })

  it('returns base elements unchanged when no node is engaged', () => {
    const neighborhood = createWorkspaceMapNeighborhood(edges, null)

    expect(presentWorkspaceMapNeighborhoodNodes(nodes, neighborhood)).toBe(nodes)
    expect(presentWorkspaceMapNeighborhoodEdges(edges, neighborhood)).toBe(edges)
  })

  it('limits emphasized edges for high-degree hub documents', () => {
    const hubEdges = Array.from({ length: 20 }, (_, index) => ({
      id: `hub-${index}`,
      source: 'hub',
      target: `leaf-${index}`,
    }))
    const neighborhood = createWorkspaceMapNeighborhood(hubEdges, 'hub')

    expect(neighborhood.nodeIds.size).toBe(21)
    expect(neighborhood.edgeIds.size).toBe(12)
  })

  it('removes only neighborhood classes when engagement clears', () => {
    const engaged = createWorkspaceMapNeighborhood(edges, 'a')
    const presentedNodes = presentWorkspaceMapNeighborhoodNodes(nodes, engaged)
    const clearedNodes = presentWorkspaceMapNeighborhoodNodes(
      presentedNodes,
      createWorkspaceMapNeighborhood(edges, null),
    )

    expect(clearedNodes[0]?.className).toBe('existing-node-class')
    expect(clearedNodes.slice(1).every((node) => node.className === undefined)).toBe(true)
  })
})
