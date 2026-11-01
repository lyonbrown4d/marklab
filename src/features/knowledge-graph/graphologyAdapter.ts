import { MultiDirectedGraph } from 'graphology'
import circular from 'graphology-layout/circular'
import { assignLayout, collectLayout } from 'graphology-layout/utils'
import { dirname } from 'pathe'
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
  fixed?: boolean
  layoutGroup: string
}
export type KnowledgeEdgeAttributes = { weight: number; kind: string }
export type KnowledgeTopology = MultiDirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>
export type GraphPalette = {
  file: string
  preview: string
  missing: string
  external?: string
  foreground: string
  muted: string
  edge: string
  primary: string
  background: string
}

export const graphNodeLayoutGroup = (node: GraphNode) =>
  node.kind === 'external'
    ? `website:${new URL(node.url).hostname}`
    : `directory:${node.kind === 'file' ? node.group.key : dirname(node.path)}`

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
    external: resolve('chart-2'),
    foreground: resolve('foreground'),
    muted: resolve('muted-foreground'),
    edge: resolve('border'),
    primary: resolve('primary'),
    background: resolve('background'),
  }
}

export const createKnowledgeTopology = (
  data: GraphData,
  positions: Record<string, { x: number; y: number }> = {},
  palette: GraphPalette,
): KnowledgeTopology => {
  const graph = new MultiDirectedGraph<KnowledgeNodeAttributes, KnowledgeEdgeAttributes>()
  data.nodes.forEach((node) => {
    graph.addNode(node.id, {
      x: 0,
      y: 0,
      label: node.label,
      kind: node.kind,
      layoutGroup: graphNodeLayoutGroup(node),
      ...graphNodeIcon(node),
      color: node.kind === 'external' ? (palette.external ?? palette.preview) : palette[node.kind],
      size: 10,
    })
  })
  seedKnowledgeTopology(graph)
  assignLayout(graph, positions)
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

export const seedKnowledgeTopology = (graph: KnowledgeTopology) =>
  circular.assign(graph, { scale: Math.sqrt(Math.max(1, graph.order)), center: 0 })

export const topologyPositions = (graph: KnowledgeTopology) => {
  const positions = collectLayout(graph)
  // The library omits NaN coordinates but permits infinity; persisted points must be finite.
  for (const [id, { x, y }] of Object.entries(positions))
    if (!Number.isFinite(x) || !Number.isFinite(y)) delete positions[id]
  return positions
}
