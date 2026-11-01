import { MultiDirectedGraph } from 'graphology'
import type { GraphData, GraphNode } from '@/logic/graph'
import { graphNodeIcon, type GraphFileIcon } from '@/features/knowledge-graph/graphNodeIcons'

export type KnowledgeNodeAttributes = {
  x: number
  y: number
  label: string
  kind: GraphNode['kind']
  size: number
  color: string
  image: string
  iconKind: GraphFileIcon
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
  background: string
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
    background: resolve('background'),
  }
}

export const createKnowledgeTopology = (
  data: GraphData,
  manualOverrides: Record<string, { x: number; y: number }> = {},
  palette: GraphPalette,
): KnowledgeTopology => {
  const graph = new MultiDirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>()
  data.nodes.forEach((node) => {
    graph.addNode(node.id, {
      ...(manualOverrides[node.id] ?? node.position),
      label: node.label,
      kind: node.kind,
      ...graphNodeIcon(node),
      color: palette[node.kind],
      size: 10,
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
