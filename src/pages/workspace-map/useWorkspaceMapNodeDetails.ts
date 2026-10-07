import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { GraphData } from '@/logic/graph'
import { fsApi } from '@/services/fsApi'
import {
  collectVisibleWorkspaceMapFileNodeIds,
  mergeWorkspaceMapNodeDetails,
} from '@/pages/workspace-map/workspaceMapNodeDetails'

const MAX_VISIBLE_NODE_DETAILS = 32
const VISIBLE_NODE_DEBOUNCE_MS = 80

type Options = {
  activePath: string | null
  container: HTMLElement | null
  graph: GraphData
  graphIdentity: string
  viewportRevision?: number
}

export const useWorkspaceMapNodeDetails = ({
  activePath,
  container,
  graph,
  graphIdentity,
  viewportRevision = 0,
}: Options): GraphData => {
  const [visibleNodeIds, setVisibleNodeIds] = useState<string[]>([])
  const contentMode = graph.nodes.find((node) => node.type === 'file')?.data.contentMode ?? 'none'

  useEffect(() => {
    if (!container || contentMode === 'none') {
      const timer = setTimeout(() => setVisibleNodeIds([]), 0)
      return () => clearTimeout(timer)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      const next = collectVisibleWorkspaceMapFileNodeIds(
        container,
        activePath,
        MAX_VISIBLE_NODE_DETAILS,
      )
      setVisibleNodeIds((current) => (sameIds(current, next) ? current : next))
    }
    const scheduleUpdate = () => {
      clearTimeout(timer)
      timer = setTimeout(update, VISIBLE_NODE_DEBOUNCE_MS)
    }
    scheduleUpdate()
    const observer = new MutationObserver(scheduleUpdate)
    const nodesLayer = container.querySelector('.react-flow__nodes') ?? container
    observer.observe(nodesLayer, { childList: true })
    return () => {
      clearTimeout(timer)
      observer.disconnect()
    }
  }, [activePath, container, contentMode, graph.layoutKey, viewportRevision])

  const detailsQuery = useQuery({
    queryKey: [
      'workspace-graph-node-details',
      graphIdentity,
      graph.revision,
      contentMode,
      visibleNodeIds,
    ],
    queryFn: async ({ signal }) => {
      signal.throwIfAborted()
      const revision = graph.revision
      if (!revision) throw new Error('Workspace graph revision is unavailable')
      const result = await fsApi.getWorkspaceGraphNodeDetails({
        mode: contentMode === 'full' ? 'full' : 'summary',
        node_ids: visibleNodeIds,
        max_nodes: MAX_VISIBLE_NODE_DETAILS,
        revision,
      })
      signal.throwIfAborted()
      if (result.revision !== revision) throw new Error('Workspace graph node details are stale')
      return result
    },
    enabled:
      Boolean(container) &&
      Boolean(graph.revision) &&
      contentMode !== 'none' &&
      visibleNodeIds.length > 0,
    gcTime: 0,
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === graph.revision && previousQuery?.queryKey[3] === contentMode
        ? previousData
        : undefined,
    retry: (failureCount, error) =>
      failureCount < 1 && !(error instanceof Error && /stale/i.test(error.message)),
    staleTime: 5_000,
  })

  return useMemo(
    () => mergeWorkspaceMapNodeDetails(graph, detailsQuery.data?.items ?? []),
    [detailsQuery.data?.items, graph],
  )
}

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])
