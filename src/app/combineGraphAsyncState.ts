type AsyncState = {
  error: unknown
  loading: boolean
  refreshing: boolean
  retry: () => Promise<unknown>
}

export const combineGraphAsyncState = (
  workspaceGraph: boolean,
  index: AsyncState,
  graph: AsyncState,
): AsyncState => {
  if (!workspaceGraph) return graph
  return {
    error: index.error ?? graph.error,
    loading: index.loading || graph.loading,
    refreshing: index.refreshing || graph.refreshing,
    retry: index.error ? index.retry : graph.retry,
  }
}
