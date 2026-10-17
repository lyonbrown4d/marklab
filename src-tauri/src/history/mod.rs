mod commands;
mod paths;
#[cfg(test)]
mod tests;
mod types;
use crate::{
    database::workspace_key,
    error::{BackendError, BackendResult},
    workspace::{RootInfo, Workspace},
};
pub use commands::*;
use paths::{normalize_path, validate_entry_id};
use sha2::{Digest, Sha256};
use sqlx::{Row, SqlitePool, sqlite::SqliteRow};
pub use types::*;

pub struct HistoryStore {
    pool: SqlitePool,
    max_entries: i64,
    max_file_bytes: usize,
    merge_window_ms: i64,
}
impl HistoryStore {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            pool,
            max_entries: 50,
            max_file_bytes: 256 * 1024,
            merge_window_ms: 10_000,
        }
    }
    pub async fn capture(
        &self,
        root: &RootInfo,
        path: &str,
        content: &str,
        reason: &str,
    ) -> BackendResult<()> {
        if reason != "save" {
            return Err(BackendError::new(
                "invalid_history_source",
                "Only saved documents create history",
            ));
        }
        self.capture_at(root, path, content, chrono::Utc::now().timestamp_millis())
            .await?;
        Ok(())
    }
    pub async fn capture_snapshot(
        &self,
        root: &RootInfo,
        path: &str,
        content: &str,
    ) -> BackendResult<CaptureResult> {
        self.capture_at(root, path, content, chrono::Utc::now().timestamp_millis())
            .await
    }
    async fn capture_at(
        &self,
        root: &RootInfo,
        path: &str,
        content: &str,
        now: i64,
    ) -> BackendResult<CaptureResult> {
        let path = normalize_path(path)?;
        let key = workspace_key(&root.kind, &root.path)?;
        if content.len() > self.max_file_bytes {
            return Ok(CaptureResult::Skipped {
                reason: "file-too-large",
            });
        }
        let hash = format!("{:x}", Sha256::digest(content.as_bytes()));
        let mut transaction = self.pool.begin().await?;
        let latest = sqlx::query("SELECT id,content_hash,created_at_ms FROM history_entries WHERE workspace_key=? AND path=? ORDER BY created_at_ms DESC,id DESC LIMIT 1")
            .bind(&key).bind(&path).fetch_optional(&mut *transaction).await?;
        if latest
            .as_ref()
            .is_some_and(|row| row.get::<String, _>("content_hash") == hash)
        {
            return Ok(CaptureResult::Skipped {
                reason: "duplicate",
            });
        }
        let date = chrono::DateTime::from_timestamp_millis(now).ok_or_else(|| {
            BackendError::new("invalid_history_time", "History timestamp is out of range")
        })?;
        let entry = HistoryEntry {
            id: format!("{now:013}-{}", uuid::Uuid::new_v4()),
            path: path.clone(),
            created_at: date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
            size_bytes: content.len() as i64,
            content_hash: hash,
            source: "save".into(),
        };
        sqlx::query("INSERT INTO history_entries(workspace_key,path,id,created_at,created_at_ms,size_bytes,content_hash,content) VALUES(?,?,?,?,?,?,?,?)")
            .bind(&key).bind(&path).bind(&entry.id).bind(&entry.created_at).bind(now).bind(entry.size_bytes).bind(&entry.content_hash).bind(content).execute(&mut *transaction).await?;
        let merge = latest.as_ref().is_some_and(|row| {
            let delta = now - row.get::<i64, _>("created_at_ms");
            delta >= 0 && delta <= self.merge_window_ms
        });
        if merge && let Some(latest) = latest {
            sqlx::query("DELETE FROM history_entries WHERE workspace_key=? AND path=? AND id=?")
                .bind(&key)
                .bind(&path)
                .bind(latest.get::<String, _>("id"))
                .execute(&mut *transaction)
                .await?;
        }
        sqlx::query("DELETE FROM history_entries WHERE workspace_key=? AND path=? AND id NOT IN (SELECT id FROM history_entries WHERE workspace_key=? AND path=? ORDER BY created_at_ms DESC,id DESC LIMIT ?)")
            .bind(&key).bind(&path).bind(&key).bind(&path).bind(self.max_entries).execute(&mut *transaction).await?;
        transaction.commit().await?;
        Ok(if merge {
            CaptureResult::Merged { entry }
        } else {
            CaptureResult::Created { entry }
        })
    }
    pub async fn list(&self, root: &RootInfo, path: &str) -> BackendResult<Vec<HistoryEntry>> {
        let path = normalize_path(path)?;
        let key = workspace_key(&root.kind, &root.path)?;
        let rows = sqlx::query("SELECT id,path,created_at,size_bytes,content_hash FROM history_entries WHERE workspace_key=? AND path=? ORDER BY created_at_ms DESC,id DESC LIMIT ?")
            .bind(key).bind(path).bind(self.max_entries).fetch_all(&self.pool).await?;
        Ok(rows.into_iter().map(to_entry).collect())
    }
    pub async fn read(
        &self,
        root: &RootInfo,
        path: &str,
        id: &str,
    ) -> BackendResult<HistorySnapshot> {
        validate_entry_id(id)?;
        let path = normalize_path(path)?;
        let key = workspace_key(&root.kind, &root.path)?;
        let row = sqlx::query("SELECT id,path,created_at,size_bytes,content_hash,content FROM history_entries WHERE workspace_key=? AND path=? AND id=?")
            .bind(key).bind(path).bind(id).fetch_optional(&self.pool).await?.ok_or_else(|| not_found(id))?;
        let content: String = row.get("content");
        Ok(HistorySnapshot {
            entry: to_entry(row),
            content,
        })
    }
    pub async fn restore(
        &self,
        workspace: &Workspace,
        path: &str,
        id: &str,
    ) -> BackendResult<HistorySnapshot> {
        let _mutation = workspace.mutation.lock().await;
        self.restore_under_lock(workspace, path, id).await
    }
    /// Caller holds workspace.mutation and has verified the window binding.
    pub async fn restore_under_lock(
        &self,
        workspace: &Workspace,
        path: &str,
        id: &str,
    ) -> BackendResult<HistorySnapshot> {
        let path = normalize_path(path)?;
        workspace.ensure_active()?;
        let target = workspace.resolve_async(&path).await?;
        let snapshot = self.read(&workspace.root_info(), &path, id).await?;
        let buffers = workspace.buffers.clone();
        let key = path.clone();
        let previous =
            crate::blocking::run(move || Ok(buffers.blocking_lock().get(&key).cloned())).await?;
        let result: BackendResult<()> = async {
            workspace
                .restore_file_under_lock(&path, &snapshot.content)
                .await?;
            workspace.flush_buffers_under_lock().await?;
            // Even an identical clean buffer must detect a changed disk file.
            // Bound the read by the <=256 KiB history snapshot, not external size.
            use tokio::io::AsyncReadExt;
            let file = tokio::fs::File::open(target).await?;
            let mut persisted = Vec::with_capacity(snapshot.content.len().saturating_add(1));
            file.take(snapshot.content.len() as u64 + 1)
                .read_to_end(&mut persisted)
                .await?;
            if persisted != snapshot.content.as_bytes() {
                return Err(BackendError::new(
                    "history_restore_conflict",
                    "File changed on disk while restoring local history",
                ));
            }
            Ok(())
        }
        .await;
        if let Err(error) = result {
            // Preserve the prior draft only if this target did not commit: a
            // successful target save may precede an unrelated buffer's failure.
            if let Some(mut previous) = previous {
                let mut buffers = workspace.buffers.lock().await;
                if let Some(current) = buffers.get_mut(&path)
                    && current.baseline == previous.baseline
                    && current.content == snapshot.content
                {
                    previous.revision = current.revision.saturating_add(1);
                    *current = previous;
                    workspace.next_revision();
                }
            }
            return Err(error);
        }
        Ok(snapshot)
    }
    pub async fn delete(
        &self,
        root: &RootInfo,
        path: &str,
        id: &str,
    ) -> BackendResult<DeleteResult> {
        validate_entry_id(id)?;
        let path = normalize_path(path)?;
        let key = workspace_key(&root.kind, &root.path)?;
        let deleted =
            sqlx::query("DELETE FROM history_entries WHERE workspace_key=? AND path=? AND id=?")
                .bind(key)
                .bind(path)
                .bind(id)
                .execute(&self.pool)
                .await?
                .rows_affected();
        if deleted == 0 {
            return Err(not_found(id));
        }
        Ok(DeleteResult { ok: true })
    }
    pub async fn clear(&self, root: &RootInfo, path: &str) -> BackendResult<ClearResult> {
        let path = normalize_path(path)?;
        let key = workspace_key(&root.kind, &root.path)?;
        let deleted = sqlx::query("DELETE FROM history_entries WHERE workspace_key=? AND path=?")
            .bind(key)
            .bind(path)
            .execute(&self.pool)
            .await?
            .rows_affected();
        Ok(ClearResult { deleted })
    }
}
fn to_entry(row: SqliteRow) -> HistoryEntry {
    HistoryEntry {
        id: row.get("id"),
        path: row.get("path"),
        created_at: row.get("created_at"),
        size_bytes: row.get("size_bytes"),
        content_hash: row.get("content_hash"),
        source: "save".into(),
    }
}
fn not_found(id: &str) -> BackendError {
    BackendError::new(
        "history_not_found",
        format!("Local history entry not found: {id}"),
    )
}
