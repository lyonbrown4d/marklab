import {
  queryWorkspaceGraphNodeDetails,
  type WorkspaceGraphNodeDetailsResult,
  type WorkspaceGraphNodeDetailsSelection,
} from '@electron/services/knowledgeEngine/workspaceGraphNodeDetails'

type GraphDocument = { path: string; content: string }

export type WorkspaceGraphNodeDetailsWorkerResult = WorkspaceGraphNodeDetailsResult & {
  revision: string
}

const MAX_CACHE_ENTRIES = 32

export class WorkspaceGraphNodeDetailsCache {
  private revision = ''
  private readonly entries = new Map<string, WorkspaceGraphNodeDetailsWorkerResult>()

  query(
    revision: string,
    documents: GraphDocument[],
    selection: WorkspaceGraphNodeDetailsSelection,
  ): WorkspaceGraphNodeDetailsWorkerResult {
    if (revision !== this.revision) {
      this.revision = revision
      this.entries.clear()
    }
    const key = JSON.stringify([
      selection.mode,
      selection.max_nodes ?? null,
      [...new Set(selection.node_ids)],
    ])
    const cached = this.entries.get(key)
    if (cached) return cached
    const result = { ...queryWorkspaceGraphNodeDetails(documents, selection), revision }
    this.entries.set(key, result)
    if (this.entries.size > MAX_CACHE_ENTRIES)
      this.entries.delete(this.entries.keys().next().value!)
    return result
  }
}
