import type {
  WorkspaceDocument,
  WorkspaceGraph as ProtoWorkspaceGraph,
  WorkspaceGraphBlock as ProtoWorkspaceGraphBlock,
  WorkspaceGraphEdge as ProtoWorkspaceGraphEdge,
  WorkspaceGraphNode as ProtoWorkspaceGraphNode,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import {
  WorkspaceGraphBlockKind,
  WorkspaceGraphEdgeKind,
  WorkspaceGraphMode,
  WorkspaceGraphNodeKind,
} from '@electron/generated/knowledge-engine/knowledge/engine/v1/engine.js'
import { invokeUnary } from '@electron/services/knowledgeEngine/grpcClientRuntime.js'
import type { WorkspaceClient } from '@electron/services/knowledgeEngine/grpcWire.js'
import type { FsGraph, FsGraphEdge, FsGraphNode } from '@electron/services/workspace/types.js'

export type KnowledgeGraphDocument = {
  path: string
  title?: string
  content: string
}

export type KnowledgeGraphKnownPaths = {
  paths: string[]
  assetPaths: string[]
}

export const buildWorkspaceGraph = async (
  sessionToken: string,
  client: WorkspaceClient,
  documents: KnowledgeGraphDocument[],
  knownPaths: KnowledgeGraphKnownPaths,
): Promise<FsGraph> => {
  const response = await invokeUnary(sessionToken, client, client.buildWorkspaceGraph, {
    documents: documents.map(documentToProto),
    knownPaths: {
      paths: knownPaths.paths,
      assetPaths: knownPaths.assetPaths,
    },
  })
  return graphFromProto(response)
}

export const buildOutlineGraph = async (
  sessionToken: string,
  client: WorkspaceClient,
  path: string,
  content: string,
): Promise<FsGraph> => {
  const response = await invokeUnary(sessionToken, client, client.buildOutlineGraph, {
    path,
    content,
  })
  return graphFromProto(response)
}

const documentToProto = (document: KnowledgeGraphDocument): WorkspaceDocument => ({
  path: document.path,
  title: document.title ?? '',
  content: document.content,
})

const graphFromProto = (response: ProtoWorkspaceGraph): FsGraph => ({
  mode: response.mode === WorkspaceGraphMode.WORKSPACE_GRAPH_MODE_OUTLINE ? 'outline' : 'mindmap',
  nodes: response.nodes.map(graphNodeFromProto),
  edges: response.edges.map(graphEdgeFromProto),
})

const graphNodeFromProto = (node: ProtoWorkspaceGraphNode): FsGraphNode => ({
  id: node.id,
  kind: graphNodeKindFromProto(node.kind),
  label: node.label,
  path: node.path ?? null,
  line: node.line ?? null,
  level: node.level ?? null,
  slug: node.slug ?? null,
  content: node.content ?? null,
  content_blocks:
    node.contentBlocks.length > 0 ? node.contentBlocks.map(graphBlockFromProto) : null,
  content_start_line: node.contentStartLine ?? null,
  content_end_line: node.contentEndLine ?? null,
})

const graphEdgeFromProto = (edge: ProtoWorkspaceGraphEdge): FsGraphEdge => ({
  id: edge.id,
  source: edge.source,
  target: edge.target,
  kind: graphEdgeKindFromProto(edge.kind),
})

const graphBlockFromProto = (
  block: ProtoWorkspaceGraphBlock,
): NonNullable<FsGraphNode['content_blocks']>[number] => ({
  id: block.id,
  kind: graphBlockKindFromProto(block.kind),
  text: block.text ?? null,
  level: block.level ?? null,
  language: block.language ?? null,
  ordered: block.ordered ?? null,
  items: block.items.length > 0 ? block.items : null,
})

const graphNodeKindFromProto = (kind: WorkspaceGraphNodeKind): FsGraphNode['kind'] => {
  switch (kind) {
    case WorkspaceGraphNodeKind.WORKSPACE_GRAPH_NODE_KIND_HEADING:
      return 'heading'
    case WorkspaceGraphNodeKind.WORKSPACE_GRAPH_NODE_KIND_MISSING:
      return 'missing'
    case WorkspaceGraphNodeKind.WORKSPACE_GRAPH_NODE_KIND_EXTERNAL:
      return 'external'
    default:
      return 'file'
  }
}

const graphEdgeKindFromProto = (kind: WorkspaceGraphEdgeKind): FsGraphEdge['kind'] => {
  switch (kind) {
    case WorkspaceGraphEdgeKind.WORKSPACE_GRAPH_EDGE_KIND_REFERENCES_HEADING:
      return 'references_heading'
    case WorkspaceGraphEdgeKind.WORKSPACE_GRAPH_EDGE_KIND_LINKS_TO:
      return 'links_to'
    default:
      return 'contains'
  }
}

const graphBlockKindFromProto = (
  kind: WorkspaceGraphBlockKind,
): NonNullable<FsGraphNode['content_blocks']>[number]['kind'] => {
  switch (kind) {
    case WorkspaceGraphBlockKind.WORKSPACE_GRAPH_BLOCK_KIND_BLOCKQUOTE:
      return 'blockquote'
    case WorkspaceGraphBlockKind.WORKSPACE_GRAPH_BLOCK_KIND_CODE:
      return 'code'
    case WorkspaceGraphBlockKind.WORKSPACE_GRAPH_BLOCK_KIND_LIST:
      return 'list'
    case WorkspaceGraphBlockKind.WORKSPACE_GRAPH_BLOCK_KIND_DIVIDER:
      return 'divider'
    case WorkspaceGraphBlockKind.WORKSPACE_GRAPH_BLOCK_KIND_TABLE:
      return 'table'
    default:
      return 'paragraph'
  }
}
