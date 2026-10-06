import {
  GraphLayoutRepository,
  type GraphLayoutRow,
} from '@electron/database/repositories/graphLayoutRepository'
import {
  GraphNodeLayoutRepository,
  type GraphNodeLayoutRow,
} from '@electron/database/repositories/graphNodeLayoutRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import type {
  GraphLayoutNode,
  GraphLayoutRequest,
  GraphLayoutResult,
  GraphLayoutSave,
} from '@electron/services/graphLayout/graphLayoutSchemas'

export class GraphLayoutStore {
  private readonly layouts = new GraphLayoutRepository()
  private readonly nodes = new GraphNodeLayoutRepository()

  constructor(private readonly localDatabaseService: LocalDatabaseService) {}

  async get(workspaceKey: string, request: GraphLayoutRequest): Promise<GraphLayoutResult> {
    await this.localDatabaseService.initialize()
    return this.localDatabaseService.sqlite.transaction((): GraphLayoutResult => {
      const layout = this.layouts.get(this.localDatabaseService, workspaceKey, request.layoutKey)
      if (!layout) return { match: 'miss', nodes: [], viewport: null }

      const rows = this.nodes.list(this.localDatabaseService, workspaceKey, request.layoutKey)
      const exact =
        layout.graph_revision === request.graphRevision &&
        layout.engine_version === request.engineVersion &&
        layout.mode === request.mode
      return {
        match: exact ? 'exact' : 'stale',
        nodes: rows.map(toGraphLayoutNode),
        viewport: exact ? readViewport(layout) : null,
      }
    })()
  }

  async save(workspaceKey: string, value: GraphLayoutSave): Promise<void> {
    await this.localDatabaseService.initialize()
    this.localDatabaseService.sqlite.transaction(() => {
      this.layouts.upsert(this.localDatabaseService, layoutWrite(workspaceKey, value))
      this.nodes.replace(
        this.localDatabaseService,
        workspaceKey,
        value.layoutKey,
        nodeRows(workspaceKey, value),
      )
    })()
  }
}

const layoutWrite = (workspaceKey: string, value: GraphLayoutSave) => ({
  engine_version: value.engineVersion,
  graph_revision: value.graphRevision,
  layout_key: value.layoutKey,
  mode: value.mode,
  viewport_x: value.viewport?.x ?? null,
  viewport_y: value.viewport?.y ?? null,
  viewport_zoom: value.viewport?.zoom ?? null,
  workspace_key: workspaceKey,
})

const nodeRows = (workspaceKey: string, value: GraphLayoutSave) =>
  value.nodes.map((node) => ({
    collapsed: toSqliteBoolean(node.collapsed),
    height: node.height,
    layout_key: value.layoutKey,
    node_id: node.id,
    pinned: toSqliteBoolean(node.pinned),
    user_modified: toSqliteBoolean(node.userModified),
    width: node.width,
    workspace_key: workspaceKey,
    x: node.x,
    y: node.y,
  }))

const toGraphLayoutNode = (row: GraphNodeLayoutRow): GraphLayoutNode => ({
  collapsed: Boolean(row.collapsed),
  height: row.height,
  id: row.node_id,
  pinned: Boolean(row.pinned),
  userModified: Boolean(row.user_modified),
  width: row.width,
  x: row.x,
  y: row.y,
})

const readViewport = (row: GraphLayoutRow) => {
  if (row.viewport_x === null || row.viewport_y === null || row.viewport_zoom === null) return null
  return { x: row.viewport_x, y: row.viewport_y, zoom: row.viewport_zoom }
}

const toSqliteBoolean = (value: boolean): 0 | 1 => (value ? 1 : 0)
