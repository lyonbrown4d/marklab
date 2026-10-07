import type { Edge, Node } from '@xyflow/react'
import type { FsGraph } from '@/services/fsApi'
import { graphNodeContent } from '@/logic/graphNodeContent'
import type { PreviewFileKind } from '@/logic/fileTypes'
import type { GraphContentMode } from '@/store/appTypes'
import { normalizeMarkdownBlocks, type MarkdownBlock } from '@/logic/markdownBlocks'
import { createGraphLayoutKey } from '@/logic/graphLayoutKey'

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
  graphBranch?: {
    collapsed: boolean
    descendantCount: number
    label: string
    title: string
    toggle: (nodeId: string) => void
  }
  onUpdateTitle?: (nodeId: string, title: string) => void
  onUpdateContent?: (nodeId: string, content: string, contentBlocks?: MarkdownBlock[]) => void
  workspaceMapEditor?: {
    active: true
    loadState: WorkspaceMapEditorLoadState
    onChange: (value: string) => void
    onClose: () => void
    onOpenFull: () => void
    onRetry: () => void
    readOnly: boolean
  }
  workspaceMapDisclosure?: {
    collapsed: boolean
    toggle: (nodeId: string) => void
  }
  workspaceMap?: true
  workspaceMapMode?: 'focus' | 'overview'
  workspaceMapPinned?: boolean
  workspaceGroup?: {
    key: string
    label: string
    source: 'frontmatter' | 'path' | 'semantic' | 'workspace'
  }
  webView?: {
    active: boolean
    activate: (nodeId: string) => void
    deactivate: () => void
  }
}

export type WorkspaceMapEditorLoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; content: string }

export type GraphData = {
  nodes: Node<GraphNodeData>[]
  edges: Edge[]
  layoutKey?: string
  revision?: string
}

export const buildGraphFromKnowledgeGraph = (
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
      content: graphNodeContent(node, includeContent),
      contentBlocks: includeContent
        ? normalizeMarkdownBlocks(node.content_blocks ?? undefined)
        : undefined,
      contentStartLine: includeContent ? (node.content_start_line ?? undefined) : undefined,
      contentEndLine: includeContent ? (node.content_end_line ?? undefined) : undefined,
      contentMode,
      previewKind: node.preview_kind ?? undefined,
      sourcePath: node.source_path ?? undefined,
      target: node.target ?? undefined,
      workspaceGroup: node.group ?? undefined,
    },
    position: { x: 0, y: 0 },
  }))
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    className: edge.kind === 'contains' ? 'graph-edge--hierarchy' : 'graph-edge--reference',
    data: { kind: edge.kind },
  }))

  return {
    nodes,
    edges,
    layoutKey: createGraphLayoutKey(graph.mode, nodes, edges),
    revision: graph.revision,
  }
}
