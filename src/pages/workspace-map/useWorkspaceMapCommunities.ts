import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useStore } from 'zustand'
import type { GraphData } from '@/logic/graph'
import { navigationHistoryStore } from '@/features/navigation/navigationHistory'
import { graphComputeApi } from '@/services/graphComputeApi'
import {
  ALL_GRAPH_VIEW,
  COMMUNITY_GRAPH_LIMIT,
  createWorkspaceMapCommunityGraph,
  graphCommunityLinks,
  indexGraphCommunities,
} from '@/pages/workspace-map/workspaceMapCommunities'
import {
  clearWorkspaceMapNodeFocusRequest,
  requestWorkspaceMapNodeFocus,
  workspaceMapNavigationStore,
} from '@/utils/workspaceMapNavigation'

export const useWorkspaceMapCommunities = ({
  activePath,
  graph,
  workspaceKey,
}: {
  activePath: string | null
  graph: GraphData
  workspaceKey: string
}) => {
  const partitioned = graph.nodes.length > COMMUNITY_GRAPH_LIMIT
  const input = useMemo(
    () => ({
      nodes: graph.nodes.map(({ id, data }) => ({ id, label: data.label })),
      edges: graph.edges.map(({ source, target }) => ({ source, target })),
    }),
    [graph.nodes, graph.edges],
  )
  const query = useQuery({
    // Content revisions do not change communities. Key the actual computation
    // metadata so autosave cannot detach the live Canvas or steal editor focus.
    queryKey: ['workspace-map-communities', workspaceKey, input],
    queryFn: async ({ signal }) => {
      const result = await graphComputeApi.communities(input, signal)
      indexGraphCommunities(graph, result.communities)
      return result.communities
    },
    enabled: partitioned,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  })
  const communities = query.data
  const membership = useMemo(
    () => (communities ? indexGraphCommunities(graph, communities) : new Map<string, string>()),
    [communities, graph],
  )
  const pathIds = useMemo(
    () =>
      new Map(
        graph.nodes.filter((node) => node.data.path).map((node) => [node.data.path!, node.id]),
      ),
    [graph.nodes],
  )
  const request = useStore(workspaceMapNavigationStore, (state) => state.request)
  const pending = request?.workspaceKey === workspaceKey ? request : null
  const hasView = (id: string) =>
    id === ALL_GRAPH_VIEW || communities?.some((item) => item.id === id)
  const targetId = pending ? (pathIds.get(pending.nodeId) ?? pending.nodeId) : null
  const requestedView =
    pending && (!partitioned || communities)
      ? pending.viewId && hasView(pending.viewId)
        ? pending.viewId
        : pending.nodeId === 'workspace'
          ? ALL_GRAPH_VIEW
          : targetId
            ? (membership.get(targetId) ?? ALL_GRAPH_VIEW)
            : ALL_GRAPH_VIEW
      : null
  const [selection, setSelection] = useState<{
    workspaceKey: string
    activePath: string | null
    viewId: string | null
  }>({ workspaceKey, activePath, viewId: null })
  if (
    pending &&
    requestedView &&
    (selection.workspaceKey !== workspaceKey ||
      selection.activePath !== activePath ||
      selection.viewId !== requestedView)
  ) {
    setSelection({ workspaceKey, activePath, viewId: requestedView })
  }
  const activeId = activePath ? pathIds.get(activePath) : undefined
  const defaultView =
    partitioned && communities?.length
      ? ((activeId ? membership.get(activeId) : null) ?? communities[0]!.id)
      : ALL_GRAPH_VIEW
  const selected =
    selection.workspaceKey === workspaceKey && (!activePath || selection.activePath === activePath)
      ? selection.viewId
      : null
  const viewId = requestedView ?? (selected && hasView(selected) ? selected : defaultView)
  const selectView = useCallback(
    (id: string) => {
      if (id === viewId) return
      const history = navigationHistoryStore.getState()
      if (history.workspaceKey === workspaceKey) {
        const current = history.entries[history.index]
        if (current?.kind === 'graph' && !current.viewId) history.visit({ ...current, viewId })
        history.visit({ kind: 'graph', nodeId: 'workspace', viewId: id })
      }
      setSelection({ workspaceKey, activePath, viewId: id })
    },
    [activePath, viewId, workspaceKey],
  )

  useEffect(() => {
    if (!pending || !requestedView) return
    if (pending.nodeId !== 'workspace' && !graph.nodes.some((node) => node.id === targetId)) {
      clearWorkspaceMapNodeFocusRequest(pending)
      return
    }
    // A refreshed community can disappear; its former camera cannot describe the new view.
    if (
      pending.viewId &&
      pending.viewId !== requestedView &&
      workspaceMapNavigationStore.getState().request === pending
    ) {
      requestWorkspaceMapNodeFocus({ ...pending, viewId: requestedView, viewport: undefined })
    }
  }, [activePath, graph.nodes, pending, requestedView, targetId, workspaceKey])

  const community = communities?.find((item) => item.id === viewId)
  const viewGraph = useMemo(
    () => createWorkspaceMapCommunityGraph(graph, community),
    [graph, community],
  )
  const links = useMemo(
    () => graphCommunityLinks(graph, viewId, membership),
    [graph, membership, viewId],
  )
  const navigateNode = useCallback(
    (nodeId: string, targetView?: string) => {
      requestWorkspaceMapNodeFocus({
        nodeId,
        workspaceKey,
        viewId: targetView ?? membership.get(nodeId) ?? ALL_GRAPH_VIEW,
      })
    },
    [membership, workspaceKey],
  )
  return {
    communities: communities ?? [],
    editorVisible: Boolean(
      activePath && viewGraph.nodes.some((node) => node.data.path === activePath),
    ),
    error: partitioned && query.isError,
    loading: partitioned && query.isPending,
    links,
    navigateNode,
    retry: query.refetch,
    selectView,
    viewGraph,
    viewId,
  }
}
