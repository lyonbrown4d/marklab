import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast'
import { parseMarkdownBlocks } from '@electron/services/workspace/markdown/blocks'
import type { FsMarkdownBlock } from '@electron/services/workspace/types'
import { workspaceFileSummary } from '@electron/services/knowledgeEngine/workspaceGraphSummary'

const DEFAULT_MAX_NODES = 32
const MAX_NODES = 64
const MAX_BLOCKS_PER_NODE = 24
const MAX_BLOCK_CHARACTERS = 16_384
export const MAX_GRAPH_NODE_MARKDOWN_CHARACTERS = 65_536

type GraphDocument = { path: string; content: string }

export type WorkspaceGraphNodeDetailsQuery = {
  revision: string
} & WorkspaceGraphNodeDetailsSelection

export type WorkspaceGraphNodeDetailsSelection = {
  node_ids: string[]
  mode: 'summary' | 'full'
  max_nodes?: number
}

export type WorkspaceGraphNodeDetails = {
  id: string
  content: string
  content_blocks?: FsMarkdownBlock[]
}

export type WorkspaceGraphNodeDetailsResult = {
  items: WorkspaceGraphNodeDetails[]
  truncated: boolean
}

export const parseWorkspaceGraphNodeDetailsQuery = (
  value: unknown,
): WorkspaceGraphNodeDetailsQuery => {
  if (!value || typeof value !== 'object') throw new Error('Graph node details query is required')
  const candidate = value as Record<string, unknown>
  if (typeof candidate.revision !== 'string' || candidate.revision.length === 0) {
    throw new Error('Graph node details revision is required')
  }
  if (candidate.mode !== 'summary' && candidate.mode !== 'full') {
    throw new Error('Graph node details mode must be summary or full')
  }
  if (
    !Array.isArray(candidate.node_ids) ||
    candidate.node_ids.length === 0 ||
    candidate.node_ids.length > 256 ||
    candidate.node_ids.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 1_024)
  ) {
    throw new Error('node_ids must contain between 1 and 256 bounded node identifiers')
  }
  if (
    candidate.max_nodes !== undefined &&
    (!Number.isInteger(candidate.max_nodes) || Number(candidate.max_nodes) < 1)
  ) {
    throw new Error('max_nodes must be a positive integer')
  }
  return {
    mode: candidate.mode,
    node_ids: candidate.node_ids as string[],
    revision: candidate.revision,
    ...(candidate.max_nodes === undefined ? {} : { max_nodes: Number(candidate.max_nodes) }),
  }
}

export const queryWorkspaceGraphNodeDetails = (
  documents: GraphDocument[],
  query: WorkspaceGraphNodeDetailsSelection,
): WorkspaceGraphNodeDetailsResult => {
  if (query.node_ids.length === 0) throw new Error('node_ids must not be empty')

  const requested = [...new Set(query.node_ids)]
  const limit = Math.min(Math.max(query.max_nodes ?? DEFAULT_MAX_NODES, 1), MAX_NODES)
  const selected = requested.slice(0, limit)
  const documentsByPath = new Map(documents.map((document) => [document.path, document]))
  const items = selected.flatMap((id) => {
    const document = documentForNode(id, documentsByPath)
    if (!document) return []
    const markdown = document.content.slice(0, MAX_GRAPH_NODE_MARKDOWN_CHARACTERS)
    const tree = parseMarkdownAst(markdown)
    const content = workspaceFileSummary(markdown, tree)
    if (query.mode === 'summary') return [{ id, content }]
    return [{ id, content, content_blocks: boundedBlocks(id, markdown, tree) }]
  })

  return { items, truncated: requested.length > selected.length }
}

const documentForNode = (
  id: string,
  documentsByPath: Map<string, GraphDocument>,
): GraphDocument | undefined => {
  if (!id.startsWith('file:')) return undefined
  return documentsByPath.get(id.slice('file:'.length))
}

const boundedBlocks = (
  id: string,
  markdown: string,
  tree: Parameters<typeof parseMarkdownBlocks>[2],
): FsMarkdownBlock[] => {
  const blocks = parseMarkdownBlocks(id, markdown, tree)
  const selected: FsMarkdownBlock[] = []
  let characters = 0

  for (const block of blocks) {
    const blockCharacters = block.text?.length ?? block.items?.join('\n').length ?? 0
    if (
      selected.length >= MAX_BLOCKS_PER_NODE ||
      characters + blockCharacters > MAX_BLOCK_CHARACTERS
    ) {
      break
    }
    selected.push(block)
    characters += blockCharacters
  }

  return selected
}

export const selectWorkspaceGraphNodeDocuments = (
  documents: GraphDocument[],
  query: WorkspaceGraphNodeDetailsSelection,
): GraphDocument[] => {
  const limit = Math.min(Math.max(query.max_nodes ?? DEFAULT_MAX_NODES, 1), MAX_NODES)
  const paths = new Set(
    [...new Set(query.node_ids)]
      .slice(0, limit)
      .filter((id) => id.startsWith('file:'))
      .map((id) => id.slice('file:'.length)),
  )
  return documents
    .filter((document) => paths.has(document.path))
    .map((document) => ({
      ...document,
      content: document.content.slice(0, MAX_GRAPH_NODE_MARKDOWN_CHARACTERS),
    }))
}
