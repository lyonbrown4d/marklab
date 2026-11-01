CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY, value_json TEXT NOT NULL, version INTEGER
);
CREATE TABLE IF NOT EXISTS window_sessions (
 id TEXT PRIMARY KEY, value_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS window_state (
 window_id TEXT PRIMARY KEY, value_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS recent_workspaces (
 workspace_path TEXT PRIMARY KEY, position INTEGER NOT NULL CHECK(position >= 0)
);
CREATE TABLE IF NOT EXISTS history_entries (
 workspace_key TEXT NOT NULL, path TEXT NOT NULL, id TEXT NOT NULL,
 created_at TEXT NOT NULL, created_at_ms INTEGER NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0), content_hash TEXT NOT NULL,
 content TEXT NOT NULL, PRIMARY KEY(workspace_key,path,id)
);
CREATE INDEX IF NOT EXISTS history_document_time ON history_entries(workspace_key,path,created_at_ms DESC,id DESC);
