import isEqual from 'lodash-es/isEqual'
import type { GraphData } from '@/logic/graph'
import { normalizeMarkdownBlocks } from '@/logic/markdownBlocks'
import type { WorkspaceGraphNodeDetailsResult } from '@/services/fsApi'

type NodeDetail = WorkspaceGraphNodeDetailsResult['items'][number]
type GraphNode = GraphData['nodes'][number]
type CachedNodeDetail = { source: GraphNode; detail: NodeDetail; merged: GraphNode }

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

export const createWorkspaceMapNodeDetailsMerger = () => {
  let cache = new Map<string, CachedNodeDetail>()
  return (graph: GraphData, details: NodeDetail[]): GraphData => {
    const previous = cache
    // Keep only the current batch, so panning cannot accumulate offscreen document previews.
    cache = new Map<string, CachedNodeDetail>()
    if (details.length === 0) return graph
    const detailsById = new Map(details.map((detail) => [detail.id, detail]))
    return {
      ...graph,
      nodes: graph.nodes.map((node) => {
        const detail = detailsById.get(node.id)
        if (!detail) return node
        const cached = previous.get(node.id)
        const unchanged = cached && isEqual(cached.detail, detail)
        const merged =
          unchanged && cached.source === node
            ? cached.merged
            : {
                ...node,
                data: {
                  ...node.data,
                  content: detail.content,
                  preview: unchanged ? cached.merged.data.preview : detail.preview,
                  contentBlocks: unchanged
                    ? cached.merged.data.contentBlocks
                    : normalizeMarkdownBlocks(detail.content_blocks ?? undefined),
                },
              }
        cache.set(node.id, { source: node, detail, merged })
        return merged
      }),
    }
  }
}
