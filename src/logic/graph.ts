import type { Edge, Node } from '@xyflow/react'
import { graphlib, layout as dagreLayout } from '@dagrejs/dagre'
import type { FsGraph, FsWorkspaceIndex } from '@/services/fsApi'
import { createFileLabel } from '@/logic/paths'
import type { PreviewFileKind } from '@/logic/fileTypes'
import { appendPreviewNodesFromWorkspaceIndex } from '@/logic/graphPreviewNodes'
import type { GraphContentMode } from '@/store/appTypes'
import { normalizeMarkdownBlocks, type MarkdownBlock } from '@/logic/markdownBlocks'
import { createGraphLayoutKey } from '@/logic/graphLayoutKey'
import { getGraphNodeLayoutSize } from '@/logic/graphLayout'

export type GraphNodeData = Record<string, unknown> & {
  label: string
  subtitle?: string
  path?: string
  line?: number
  level?: number
  slug?: string
  url?: string
  content?: string
  contentBlocks?: MarkdownBlock[]
  contentStartLine?: number
  contentEndLine?: number
  contentMode?: GraphContentMode
  previewKind?: PreviewFileKind
  sourcePath?: string
  target?: string
  editable?: boolean
  onUpdateTitle?: (nodeId: string, title: string) => void
  onUpdateContent?: (nodeId: string, content: string, contentBlocks?: MarkdownBlock[]) => void
}

export type GraphData = {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  layoutKey?: string
}

const DAGRE_MARGIN = 120
export const buildGraphFromWorkspaceIndex = (index: FsWorkspaceIndex): GraphData => {
  const edges: Edge[] = []
  const fileNodes = new Map<string, Node<GraphNodeData>>()
  const externalNodes = new Map<string, Node<GraphNodeData>>()
  const missingNodes = new Map<string, Node<GraphNodeData>>()
  const headingNodes = new Map<string, Node<GraphNodeData>>()
  const headingSlugIndex = new Map<string, Map<string, string>>()

  index.files.forEach((file) => {
    const label = createFileLabel(file.path)
    fileNodes.set(file.path, {
      id: `file:${file.path}`,
      type: 'file',
      data: { label, path: file.path },
      position: { x: 0, y: 0 },
    })
  })

  index.files.forEach((file) => {
    const sourceId = `file:${file.path}`
    const headingIdsBySlug = new Map<string, string>()
    headingSlugIndex.set(file.path, headingIdsBySlug)

    const headingStack: Array<{ level: number; id: string }> = []
    file.headings.forEach((heading) => {
      const headingId = `heading:${file.path}:${heading.slug}`
      headingIdsBySlug.set(heading.slug, headingId)
      headingNodes.set(headingId, {
        id: headingId,
        type: 'heading',
        data: {
          label: heading.text,
          subtitle: `H${heading.level}`,
          path: file.path,
          line: heading.line,
          level: heading.level,
          slug: heading.slug,
        },
        position: { x: 0, y: 0 },
      })
      while (
        headingStack.length > 0 &&
        headingStack[headingStack.length - 1].level >= heading.level
      ) {
        headingStack.pop()
      }
      const parentId = headingStack[headingStack.length - 1]?.id ?? sourceId
      edges.push({
        id: `${parentId}->${headingId}-${edges.length}`,
        source: parentId,
        target: headingId,
        data: { kind: 'contains' },
      })
      headingStack.push({ level: heading.level, id: headingId })
    })
  })

  index.files.forEach((file) => {
    const sourceId = `file:${file.path}`
    file.links.forEach((link) => {
      if (link.is_external) {
        const url = link.target
        if (!externalNodes.has(url)) {
          const hostname = url.replace(/^https?:\/\//i, '').split('/')[0] ?? url
          externalNodes.set(url, {
            id: `ext:${url}`,
            type: 'external',
            data: { label: link.text || hostname, subtitle: hostname, url },
            position: { x: 0, y: 0 },
          })
        }
        edges.push({
          id: `${sourceId}->ext:${url}-${edges.length}`,
          source: sourceId,
          target: `ext:${url}`,
        })
        return
      }

      const targetPath = link.target_path
      if (!targetPath) return

      const targetHeadingId = link.target_heading_slug
        ? headingSlugIndex.get(targetPath)?.get(link.target_heading_slug)
        : undefined
      if (targetHeadingId) {
        edges.push({
          id: `${sourceId}->${targetHeadingId}-${edges.length}`,
          source: sourceId,
          target: targetHeadingId,
        })
        return
      }

      if (fileNodes.has(targetPath)) {
        edges.push({
          id: `${sourceId}->file:${targetPath}-${edges.length}`,
          source: sourceId,
          target: `file:${targetPath}`,
        })
        return
      }

      if (!missingNodes.has(targetPath)) {
        missingNodes.set(targetPath, {
          id: `missing:${targetPath}`,
          type: 'missing',
          data: { label: createFileLabel(targetPath), subtitle: targetPath, path: targetPath },
          position: { x: 0, y: 0 },
        })
      }

      edges.push({
        id: `${sourceId}->missing:${targetPath}-${edges.length}`,
        source: sourceId,
        target: `missing:${targetPath}`,
      })
    })
  })

  const nodes = [
    ...fileNodes.values(),
    ...headingNodes.values(),
    ...externalNodes.values(),
    ...missingNodes.values(),
  ]
  if (nodes.length === 0) {
    return { nodes, edges, layoutKey: 'empty' }
  }

  applyGraphLayout(nodes, edges)
  return appendPreviewNodesFromWorkspaceIndex(
    { nodes, edges, layoutKey: createGraphLayoutKey('index', nodes, edges) },
    index,
  )
}

export const buildGraphFromRustGraph = (
  graph: FsGraph,
  contentMode: GraphContentMode = 'none',
): GraphData => {
  const includeContent = contentMode !== 'none'
  const nodes: Node<GraphNodeData>[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.kind,
    data: {
      label: node.label,
      subtitle:
        node.kind === 'heading' && node.level
          ? `H${node.level}`
          : (node.path ?? node.slug ?? undefined),
      path: node.path ?? undefined,
      line: node.line ?? undefined,
      level: node.level ?? undefined,
      slug: node.slug ?? undefined,
      content: includeContent ? (node.content ?? undefined) : undefined,
      contentBlocks: includeContent
        ? normalizeMarkdownBlocks(node.content_blocks ?? undefined)
        : undefined,
      contentStartLine: includeContent ? (node.content_start_line ?? undefined) : undefined,
      contentEndLine: includeContent ? (node.content_end_line ?? undefined) : undefined,
      contentMode,
    },
    position: { x: 0, y: 0 },
  }))
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.kind === 'contains' ? 'smoothstep' : undefined,
    data: { kind: edge.kind },
  }))

  if (nodes.length > 0 && graph.mode === 'outline') {
    applyOutlineLayout(nodes, edges)
  } else if (nodes.length > 0) {
    applyGraphLayout(nodes, edges)
  }
  return { nodes, edges, layoutKey: createGraphLayoutKey(graph.mode, nodes, edges) }
}

const applyOutlineLayout = (nodes: Node<GraphNodeData>[], edges: Edge[]) => {
  applyDagreLayout(nodes, edges, {
    rankdir: 'LR',
    ranksep: 140,
    nodesep: 34,
  })
}

const applyGraphLayout = (nodes: Node<GraphNodeData>[], edges: Edge[]) => {
  applyDagreLayout(nodes, edges, {
    rankdir: 'LR',
    ranksep: 180,
    nodesep: 54,
    edgesep: 24,
  })
}

type DagreLayoutOptions = {
  rankdir: 'TB' | 'BT' | 'LR' | 'RL'
  ranksep: number
  nodesep: number
  edgesep?: number
}

const applyDagreLayout = (
  nodes: Node<GraphNodeData>[],
  edges: Edge[],
  options: DagreLayoutOptions,
) => {
  const graph = new graphlib.Graph({ multigraph: true })
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({
    ...options,
    marginx: DAGRE_MARGIN,
    marginy: DAGRE_MARGIN,
  })

  nodes.forEach((node) => {
    const size = getGraphNodeLayoutSize(node)
    graph.setNode(node.id, size)
  })
  edges.forEach((edge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    graph.setEdge(edge.source, edge.target, {}, edge.id)
  })

  dagreLayout(graph)

  nodes.forEach((node) => {
    const layoutNode = graph.node(node.id) as
      ({ x: number; y: number } & ReturnType<typeof getGraphNodeLayoutSize>) | undefined
    const size = getGraphNodeLayoutSize(node)
    node.position = layoutNode
      ? {
          x: layoutNode.x - size.width / 2,
          y: layoutNode.y - size.height / 2,
        }
      : { x: 0, y: 0 }
  })
}
