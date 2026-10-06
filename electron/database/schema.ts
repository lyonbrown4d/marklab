export const DATABASE_DIRECTORY_NAME = 'storage'
export const DATABASE_FILE_NAME = 'marklab.sqlite3'

export const DATABASE_SETTING_KEYS = {
  syncDeviceId: 'sync.deviceId',
} as const
export const DATABASE_BUSY_TIMEOUT_MS = 5_000
export const LOCAL_AI_STATE_SINGLETON_ID = 1

export const DATABASE_TABLE_NAMES = [
  'settings',
  'recent_workspaces',
  'window_sessions',
  'session_tabs',
  'window_state',
  'ai_providers',
  'webdav_profiles',
  'workspaces',
  'graph_layouts',
  'graph_node_layouts',
  'workspace_sync_channels',
  'webdav_sync_state',
  'webdav_sync_entries',
  'sync_conflicts',
  'local_ai_state',
] as const
