import type { Generated, Kysely, Transaction } from 'kysely'

export type SqliteBoolean = 0 | 1

type Timestamped = {
  created_at: Generated<string>
  updated_at: Generated<string>
}

export type SettingsTable = {
  key: string
  value_json: string
  version: number | null
  updated_at: Generated<string>
}

export type RecentWorkspacesTable = {
  workspace_path: string
  position: number
  last_opened_at: Generated<string>
}

export type WindowSessionsTable = {
  id: string
  workspace_id: number | null
  active_tab_id: string | null
  root_kind: 'external' | 'internal' | 'single'
  root_path: string | null
  version: Generated<number>
  updated_at: Generated<string>
}

export type SessionTabsTable = {
  session_id: string
  tab_id: string
  position: number
  tab_type: string
  file_path: string | null
  title: string | null
  state_json: Generated<string>
}

export type WindowStateTable = {
  window_id: string
  x: number | null
  y: number | null
  width: number
  height: number
  is_maximized: SqliteBoolean
  updated_at: Generated<string>
}

export type AiProvidersTable = Timestamped & {
  id: string
  label: string
  kind: 'anthropic' | 'deepseek' | 'google' | 'ollama' | 'openai' | 'openai-compatible'
  model: string
  base_url: string | null
  encrypted_api_key: Buffer | null
}

export type WebDavProfilesTable = Timestamped & {
  id: string
  label: string
  endpoint: string
  base_path: string
  username: string
  encrypted_password: Buffer | null
  allow_insecure_local: SqliteBoolean
  session_only: SqliteBoolean
}

export type WorkspacesTable = {
  id: Generated<number>
  path: string
  canonical_path: string
  root_kind: 'external' | 'internal' | 'single'
  created_at: Generated<string>
  updated_at: Generated<string>
}

export type GraphLayoutsTable = {
  workspace_key: string
  layout_key: string
  graph_revision: string
  mode: string
  engine_version: string
  viewport_x: number | null
  viewport_y: number | null
  viewport_zoom: number | null
  updated_at: Generated<string>
}

export type GraphNodeLayoutsTable = {
  workspace_key: string
  layout_key: string
  node_id: string
  x: number
  y: number
  width: number
  height: number
  collapsed: SqliteBoolean
  pinned: SqliteBoolean
  user_modified: SqliteBoolean
  updated_at: Generated<string>
}

export type WorkspaceSyncChannelsTable = {
  workspace_id: number
  profile_id: string
  remote_root: string
  auto_sync: SqliteBoolean
  updated_at: Generated<string>
}

export type WebDavSyncStateTable = {
  workspace_id: number
  remote_manifest_etag: string | null
  has_unresolved_conflicts: Generated<SqliteBoolean>
  updated_at: string
}

export type WebDavSyncEntriesTable = {
  workspace_id: number
  path: string
  position: number
  hash: string
  size: number
  modified_at: string
  device_id: string
  storage: 'object' | null
  etag: string | null
  deleted_at: string | null
}

export type SyncConflictsTable = {
  workspace_id: number
  path: string
  position: number
  status: 'unresolved'
  reason: 'both_changed' | 'delete_vs_change'
  conflict_path: string | null
  local_hash: string | null
  remote_hash: string | null
  created_at: Generated<string>
}

export type DatabaseSchema = {
  settings: SettingsTable
  recent_workspaces: RecentWorkspacesTable
  window_sessions: WindowSessionsTable
  session_tabs: SessionTabsTable
  window_state: WindowStateTable
  ai_providers: AiProvidersTable
  webdav_profiles: WebDavProfilesTable
  workspaces: WorkspacesTable
  graph_layouts: GraphLayoutsTable
  graph_node_layouts: GraphNodeLayoutsTable
  workspace_sync_channels: WorkspaceSyncChannelsTable
  webdav_sync_state: WebDavSyncStateTable
  webdav_sync_entries: WebDavSyncEntriesTable
  sync_conflicts: SyncConflictsTable
}

export type DatabaseConnection = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>
