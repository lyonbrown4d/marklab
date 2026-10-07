import { WorkspaceGraphRepository } from '@electron/database/repositories/workspaceGraphRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import type { FsGraph } from '@electron/services/workspace/types'

export class WorkspaceGraphStore {
  private readonly graphs = new WorkspaceGraphRepository()

  constructor(private readonly localDatabaseService: LocalDatabaseService) {}

  async get(workspaceKey: string, revision: string): Promise<FsGraph | undefined> {
    await this.localDatabaseService.initialize()
    const row = this.graphs.get(this.localDatabaseService, workspaceKey)
    if (!row || row.graph_revision !== revision) return undefined
    return parseGraph(row.graph_json)
  }

  async save(workspaceKey: string, revision: string, graph: FsGraph): Promise<void> {
    await this.localDatabaseService.initialize()
    this.graphs.upsert(this.localDatabaseService, {
      graph_json: JSON.stringify(graph),
      graph_revision: revision,
      workspace_key: workspaceKey,
    })
  }
}

const parseGraph = (value: string): FsGraph | undefined => {
  try {
    const candidate: unknown = JSON.parse(value)
    if (!isRecord(candidate) || candidate.mode !== 'mindmap') return undefined
    if (!Array.isArray(candidate.nodes) || !candidate.nodes.every(isGraphNode)) return undefined
    if (!Array.isArray(candidate.edges) || !candidate.edges.every(isGraphEdge)) return undefined
    return candidate as FsGraph
  } catch {
    return undefined
  }
}

const isGraphNode = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.label === 'string' &&
  ['file', 'heading', 'missing', 'external'].includes(String(value.kind))

const isGraphEdge = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.source === 'string' &&
  typeof value.target === 'string' &&
  ['contains', 'links_to', 'references_heading'].includes(String(value.kind))

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
