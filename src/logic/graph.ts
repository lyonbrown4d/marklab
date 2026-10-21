import type { Edge, Node } from '@xyflow/react'
import type { FsGraph } from '@/services/fsApi'
import type { PreviewFileKind } from '@/logic/fileTypes'
import type { GraphContentMode } from '@/store/appTypes'
import type { MarkdownBlock } from '@/logic/markdownBlocks'
import { createGraphLayoutKey } from '@/logic/graphLayoutKey'
import type { WorkspaceGraphPreview } from '@/services/fsApiSchemas'

export type GraphNodeData = Record<string, unknown> & {
  label: string
  subtitle?: string
  path?: string
  line?: number
  level?: number
  slug?: string
  url?: string
  content?: string
  preview?: WorkspaceGraphPreview
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
  const nodes: Node<GraphNodeData>[] = graph.nodes.map((node) => ({
    id: node.id,
    type: node.kind,
    data: {
      label: node.label,
      subtitle: node.path,
      path: node.path,
      contentMode,
      previewKind: node.kind === 'file' ? undefined : node.preview_kind,
      sourcePath: node.kind === 'file' ? undefined : node.source_path,
      target: node.kind === 'file' ? undefined : node.target,
      workspaceGroup: node.kind === 'file' ? node.group : undefined,
    },
    position: { x: 0, y: 0 },
  }))
  const edges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    className: 'graph-edge--reference',
    data: { kind: edge.kind },
  }))

  return {
    nodes,
    edges,
    layoutKey: createGraphLayoutKey(graph.mode, nodes, edges),
    revision: graph.revision,
  }
}
