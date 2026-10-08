import { WorkspaceGraphRepository } from '@electron/database/repositories/workspaceGraphRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import {
  graphTopologyOnly,
  parseGraphTopology,
} from '@electron/services/knowledgeEngine/workspaceGraphTopology'
import type { FsGraph } from '@electron/services/workspace/types'

export class WorkspaceGraphStore {
  private readonly graphs = new WorkspaceGraphRepository()

  constructor(private readonly localDatabaseService: LocalDatabaseService) {}

  async get(workspaceKey: string, revision: string): Promise<FsGraph | undefined> {
    await this.localDatabaseService.initialize()
    const row = this.graphs.get(this.localDatabaseService, workspaceKey)
    if (!row || row.graph_revision !== revision) return undefined
    const graph = parseGraph(row.graph_json)
    if (!graph) return undefined
    const graphJson = JSON.stringify(graph)
    if (graphJson !== row.graph_json) {
      this.graphs.upsert(this.localDatabaseService, {
        graph_json: graphJson,
        graph_revision: revision,
        workspace_key: workspaceKey,
      })
    }
    return graph
  }

  async save(workspaceKey: string, revision: string, graph: FsGraph): Promise<void> {
    await this.localDatabaseService.initialize()
    this.graphs.upsert(this.localDatabaseService, {
      graph_json: JSON.stringify(graphTopologyOnly(graph)),
      graph_revision: revision,
      workspace_key: workspaceKey,
    })
  }
}

const parseGraph = (value: string): FsGraph | undefined => {
  try {
    return parseGraphTopology(JSON.parse(value))
  } catch {
    return undefined
  }
}
