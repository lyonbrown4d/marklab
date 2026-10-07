import type { GraphData } from '@/logic/graph'
import { normalizeMarkdownBlocks } from '@/logic/markdownBlocks'
import type { WorkspaceGraphNodeDetailsResult } from '@/services/fsApi'

type NodeDetail = WorkspaceGraphNodeDetailsResult['items'][number]

export const collectVisibleWorkspaceMapFileNodeIds = (
  container: HTMLElement,
  activePath: string | null,
  limit: number,
): string[] => {
  const ids = new Set<string>()
  if (activePath) ids.add(`file:${activePath}`)
  for (const element of container.querySelectorAll<HTMLElement>('.react-flow__node[data-id]')) {
    const id = element.dataset.id
    if (id?.startsWith('file:')) ids.add(id)
    if (ids.size >= limit) break
  }
  return [...ids].slice(0, limit)
}

export const mergeWorkspaceMapNodeDetails = (
  graph: GraphData,
  details: NodeDetail[],
): GraphData => {
  if (details.length === 0) return graph
  const detailsById = new Map(details.map((detail) => [detail.id, detail]))
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const detail = detailsById.get(node.id)
      if (!detail) return node
      return {
        ...node,
        data: {
          ...node.data,
          content: detail.content,
          contentBlocks: normalizeMarkdownBlocks(detail.content_blocks),
        },
      }
    }),
  }
}
