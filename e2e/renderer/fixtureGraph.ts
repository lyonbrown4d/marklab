import {
  fsGraphSchema,
  workspaceGraphNodeDetailsResultSchema,
  type FsGraph,
  type WorkspaceGraphNodeDetailsResult,
} from '@/services/fsGraphSchemas'

/** Explicit graph responses for renderer acceptance; the native parser has its own tests. */
export const createFixtureGraph = () => {
  const empty = (): FsGraph => ({
    mode: 'relations',
    revision: 'fixture-empty',
    topology_key: 'fixture-empty',
    nodes: [],
    edges: [],
    truncated: false,
    total_nodes: 0,
    total_edges: 0,
  })
  let graph = empty()
  let details: WorkspaceGraphNodeDetailsResult = {
    revision: graph.revision,
    items: [],
    truncated: false,
  }
  return {
    get: () => graph,
    getDetails: () => details,
    setDetails: (value: WorkspaceGraphNodeDetailsResult) => {
      details = workspaceGraphNodeDetailsResultSchema.parse(value)
    },
    set: (value: FsGraph) => {
      graph = fsGraphSchema.parse(value)
    },
    clear: () => {
      graph = empty()
      details = { revision: graph.revision, items: [], truncated: false }
    },
  }
}
