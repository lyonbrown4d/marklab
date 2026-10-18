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
  active?: boolean
  activePath: string | null
  container: HTMLElement | null
  graph: GraphData
  graphIdentity: string
  viewportRevision?: number
}

export const useWorkspaceMapNodeDetails = ({
  active = true,
  activePath,
  container,
  graph,
  graphIdentity,
  viewportRevision = 0,
}: Options): GraphData => {
  const [visibleNodeIds, setVisibleNodeIds] = useState<string[]>([])
  const contentMode = graph.nodes.find((node) => node.type === 'file')?.data.contentMode ?? 'none'

  useEffect(() => {
    if (!active || !container || contentMode === 'none') {
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
  }, [active, activePath, container, contentMode, graph.layoutKey, viewportRevision])

  // Detach the old batch immediately so Query can cancel and collect its detail data.
  const queryNodeIds = active ? visibleNodeIds : []
  const detailsQuery = useQuery({
    queryKey: [
      'workspace-graph-node-details',
      graphIdentity,
      graph.revision,
      contentMode,
      active ? queryNodeIds : null,
    ],
    queryFn: async ({ signal }) => {
      signal.throwIfAborted()
      const revision = graph.revision
      if (!revision) throw new Error('Workspace graph revision is unavailable')
      const result = await fsApi.getWorkspaceGraphNodeDetails({
        mode: contentMode === 'full' ? 'full' : 'summary',
        node_ids: queryNodeIds,
        max_nodes: MAX_VISIBLE_NODE_DETAILS,
        revision,
      })
      signal.throwIfAborted()
      if (result.revision !== revision) throw new Error('Workspace graph node details are stale')
      return result
    },
    enabled:
      active &&
      Boolean(container) &&
      Boolean(graph.revision) &&
      contentMode !== 'none' &&
      queryNodeIds.length > 0,
    gcTime: 0,
    // An empty inactive batch also releases QueryObserver's last defined previews.
    initialData: active
      ? undefined
      : { items: [], revision: graph.revision ?? 'inactive', truncated: false },
    placeholderData: (previousData, previousQuery) =>
      active &&
      previousQuery?.queryKey[2] === graph.revision &&
      previousQuery?.queryKey[3] === contentMode
        ? previousData
        : undefined,
    retry: (failureCount, error) =>
      failureCount < 1 && !(error instanceof Error && /stale/i.test(error.message)),
    staleTime: 5_000,
  })

  return useMemo(
    () => (active ? mergeWorkspaceMapNodeDetails(graph, detailsQuery.data?.items ?? []) : graph),
    [active, detailsQuery.data?.items, graph],
  )
}

const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])
