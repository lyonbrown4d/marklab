import { MultiDirectedGraph } from 'graphology'
import type { GraphData } from '@/logic/graph'

export type KnowledgeNodeAttributes = {
  x: number
  y: number
  label: string
  kind: string
  size: number
  color: string
}
export type KnowledgeEdgeAttributes = { weight: number; kind: string }
export type KnowledgeTopology = MultiDirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>
export type GraphPalette = {
  file: string
  preview: string
  missing: string
  foreground: string
  muted: string
  edge: string
  primary: string
}

export const readGraphPalette = (container: HTMLElement): GraphPalette => {
  // Resolve shared theme tokens to concrete colors before handing them to WebGL.
  const theme = getComputedStyle(document.documentElement)
  const local = getComputedStyle(container)
  const resolve = (token: string) => {
    const probe = document.createElement('span')
    const value =
      local.getPropertyValue(`--${token}`).trim() || theme.getPropertyValue(`--${token}`).trim()
    probe.style.color = value ? `hsl(${value})` : '#64748b'
    container.append(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }
  return {
    file: resolve('primary'),
    preview: resolve('chart-2'),
    missing: resolve('destructive'),
    foreground: resolve('foreground'),
    muted: resolve('muted-foreground'),
    edge: resolve('border'),
    primary: resolve('primary'),
  }
}

export const createKnowledgeTopology = (
  data: GraphData,
  positions: Record<string, { x: number; y: number }> = {},
  palette: GraphPalette,
): KnowledgeTopology => {
  const graph = new MultiDirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>()
  data.nodes.forEach((node, index) => {
    const angle = index * Math.PI * (3 - Math.sqrt(5))
    const radius = Math.sqrt(index + 1)
    graph.addNode(node.id, {
      ...(positions[node.id] ?? { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }),
      label: node.label,
      kind: node.kind,
      color: palette[node.kind],
      size: node.kind === 'file' ? 5 : 3.5,
    })
  })
  data.edges.forEach((edge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    graph.addDirectedEdgeWithKey(edge.id, edge.source, edge.target, {
      kind: edge.kind,
      weight: edge.count,
    })
  })
  graph.forEachNode((id, attrs) =>
    graph.setNodeAttribute(id, 'size', attrs.size + Math.min(5, Math.sqrt(graph.degree(id)))),
  )
  return graph
}

export const topologyPositions = (graph: KnowledgeTopology) => {
  const positions: Record<string, { x: number; y: number }> = Object.create(null)
  graph.forEachNode((id, attributes) => {
    positions[id] = { x: attributes.x, y: attributes.y }
  })
  return positions
}
