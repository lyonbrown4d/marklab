use super::{AnalysisService, Index, document::Document};
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::{collections::BTreeMap, sync::Arc};
const MAX_ENTRY: usize = 16 * 1024 * 1024;
const MAX_DISK: i64 = 128 * 1024 * 1024;
const TTL_MS: i64 = 30 * 24 * 60 * 60 * 1000;
#[derive(Serialize, Deserialize)]
struct Archive {
    version: u8,
    document: Document,
    positions: Vec<[usize; 4]>,
}
fn hash(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}
fn encode(document: &Document) -> BackendResult<String> {
    let positions = document
        .links
        .iter()
        .chain(&document.assets)
        .map(|link| [link.offset, link.end_offset, link.span_start, link.span_end])
        .collect();
    Ok(serde_json::to_string(&Archive {
        version: 1,
        document: document.clone(),
        positions,
    })?)
}
fn decode(
    payload: &str,
    expected_payload: &str,
    path: &str,
    expected_content: &str,
) -> Option<Document> {
    if payload.len() > MAX_ENTRY || hash(payload.as_bytes()) != expected_payload {
        return None;
    }
    let mut archive: Archive = serde_json::from_str(payload).ok()?;
    let document = &mut archive.document;
    if archive.version != 1
        || document.path != path
        || hash(document.content.as_bytes()) != expected_content
        || archive.positions.len() != document.links.len() + document.assets.len()
    {
        return None;
    }
    for (link, [offset, end, start, span_end]) in document
        .links
        .iter_mut()
        .chain(&mut document.assets)
        .zip(archive.positions)
    {
        if offset > end
            || start > offset
            || end > span_end
            || span_end > document.content.len()
            || ![offset, end, start, span_end]
                .iter()
                .all(|position| document.content.is_char_boundary(*position))
        {
            return None;
        }
        link.offset = offset;
        link.end_offset = end;
        link.span_start = start;
        link.span_end = span_end;
    }
    Some(archive.document)
}
impl AnalysisService {
    pub(super) async fn ensure_schema(&self) -> BackendResult<()> {
        self.schema.get_or_try_init(||async {
            sqlx::query("CREATE VIRTUAL TABLE IF NOT EXISTS analysis_fts USING fts5(scope UNINDEXED,path UNINDEXED,title,content,tokenize='unicode61')").execute(&self.pool).await?;
            sqlx::query("CREATE TABLE IF NOT EXISTS analysis_cache_workspaces(scope TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,last_access INTEGER NOT NULL,bytes INTEGER NOT NULL)").execute(&self.pool).await?;
            sqlx::query("CREATE TABLE IF NOT EXISTS analysis_cache_documents(scope TEXT NOT NULL,path TEXT NOT NULL,hash TEXT NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>=0),PRIMARY KEY(scope,path))").execute(&self.pool).await?;
            sqlx::query("CREATE TABLE IF NOT EXISTS analysis_cache_graphs(scope TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,payload TEXT NOT NULL,payload_hash TEXT NOT NULL,bytes INTEGER NOT NULL CHECK(bytes>=0))").execute(&self.pool).await?;
            sqlx::query("DELETE FROM analysis_cache_documents WHERE scope NOT IN (SELECT scope FROM analysis_cache_workspaces)").execute(&self.pool).await?;
            sqlx::query("DELETE FROM analysis_cache_graphs WHERE scope NOT IN (SELECT scope FROM analysis_cache_workspaces)").execute(&self.pool).await?;
            // Retire the preliminary per-launch UUID scopes; they can never be hydrated.
            sqlx::query("DELETE FROM analysis_fts WHERE scope NOT IN (SELECT scope FROM analysis_cache_workspaces)").execute(&self.pool).await?;
            self.prune_disk().await?;
            Ok::<_, BackendError>(())
        }).await?;
        Ok(())
    }
    pub(super) async fn disk_document(
        &self,
        scope: &str,
        path: &str,
        content_hash: &str,
    ) -> Option<Arc<Document>> {
        let row=sqlx::query("SELECT payload,payload_hash FROM analysis_cache_documents WHERE scope=? AND path=? AND hash=? AND length(CAST(payload AS BLOB))<=?").bind(scope).bind(path).bind(content_hash).bind(MAX_ENTRY as i64).fetch_optional(&self.pool).await.ok()??;
        let payload: String = row.try_get("payload").ok()?;
        let payload_hash: String = row.try_get("payload_hash").ok()?;
        let target = path.to_owned();
        let expected = content_hash.to_owned();
        let parsed = tokio::task::spawn_blocking(move || {
            decode(&payload, &payload_hash, &target, &expected)
        })
        .await
        .ok()
        .flatten();
        if parsed.is_none() {
            let _ = sqlx::query("DELETE FROM analysis_cache_documents WHERE scope=? AND path=?")
                .bind(scope)
                .bind(path)
                .execute(&self.pool)
                .await;
        }
        parsed.map(Arc::new)
    }
    pub(super) async fn persist_index(
        &self,
        index: &Index,
        raw: &BTreeMap<String, Arc<Document>>,
        hashes: &BTreeMap<String, String>,
    ) -> BackendResult<()> {
        let saved =
            sqlx::query("SELECT path,hash,bytes FROM analysis_cache_documents WHERE scope=?")
                .bind(&index.scope)
                .fetch_all(&self.pool)
                .await?;
        let saved: BTreeMap<String, (String, i64)> = saved
            .into_iter()
            .map(|row| {
                Ok((
                    row.try_get("path")?,
                    (row.try_get("hash")?, row.try_get("bytes")?),
                ))
            })
            .collect::<Result<_, sqlx::Error>>()?;
        let fts_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM analysis_fts WHERE scope=?")
            .bind(&index.scope)
            .fetch_one(&self.pool)
            .await?;
        let repair_fts = fts_count != saved.len() as i64;
        let mut writes = Vec::new();
        let mut estimated = 0i64;
        for (path, document) in raw {
            estimated = estimated
                .saturating_add((super::cache::document_weight(document) as i64).saturating_mul(4));
            if estimated > MAX_DISK {
                return Err(BackendError::new(
                    "CACHE_SCOPE_TOO_LARGE",
                    "Workspace exceeds the persistent analysis cache budget",
                ));
            }
            if !repair_fts && saved.get(path).map(|entry| &entry.0) == hashes.get(path) {
                continue;
            }
            let source_bytes = document.content.len();
            let document = document.clone();
            let (payload, payload_hash) = tokio::task::spawn_blocking(move || {
                let payload = encode(&document)?;
                let payload_hash = hash(payload.as_bytes());
                Ok::<_, BackendError>((payload, payload_hash))
            })
            .await
            .map_err(|error| BackendError::new("CACHE_ENCODE", error.to_string()))??;
            if payload.len() > MAX_ENTRY {
                return Err(BackendError::new(
                    "CACHE_ENTRY_TOO_LARGE",
                    "Parsed document exceeds the disk cache entry budget",
                ));
            }
            let bytes =
                (payload.len() as i64).saturating_add((source_bytes as i64).saturating_mul(3));
            writes.push((
                path.clone(),
                hashes.get(path).cloned().unwrap_or_default(),
                payload,
                payload_hash,
                bytes,
            ));
        }
        let mut transaction = self.pool.begin().await?;
        for removed in saved.keys().filter(|path| !raw.contains_key(*path)) {
            sqlx::query("DELETE FROM analysis_cache_documents WHERE scope=? AND path=?")
                .bind(&index.scope)
                .bind(removed)
                .execute(&mut *transaction)
                .await?;
            sqlx::query("DELETE FROM analysis_fts WHERE scope=? AND path=?")
                .bind(&index.scope)
                .bind(removed)
                .execute(&mut *transaction)
                .await?;
        }
        for (path, content_hash, payload, payload_hash, bytes) in writes {
            sqlx::query("INSERT INTO analysis_cache_documents(scope,path,hash,payload,payload_hash,bytes)VALUES(?,?,?,?,?,?) ON CONFLICT(scope,path)DO UPDATE SET hash=excluded.hash,payload=excluded.payload,payload_hash=excluded.payload_hash,bytes=excluded.bytes").bind(&index.scope).bind(&path).bind(content_hash).bind(payload).bind(payload_hash).bind(bytes).execute(&mut *transaction).await?;
            sqlx::query("DELETE FROM analysis_fts WHERE scope=? AND path=?")
                .bind(&index.scope)
                .bind(&path)
                .execute(&mut *transaction)
                .await?;
            if let Some(document) = raw.get(&path) {
                sqlx::query("INSERT INTO analysis_fts(scope,path,title,content)VALUES(?,?,?,?)")
                    .bind(&index.scope)
                    .bind(&path)
                    .bind(&document.title)
                    .bind(document.content.as_ref())
                    .execute(&mut *transaction)
                    .await?;
            }
        }
        let bytes: i64 = sqlx::query_scalar(
            "SELECT (SELECT COALESCE(SUM(bytes),0) FROM analysis_cache_documents WHERE scope=?)+(SELECT COALESCE(SUM(bytes),0) FROM analysis_cache_graphs WHERE scope=?)",
        )
        .bind(&index.scope)
        .bind(&index.scope)
        .fetch_one(&mut *transaction)
        .await?;
        sqlx::query("INSERT INTO analysis_cache_workspaces(scope,fingerprint,last_access,bytes)VALUES(?,?,?,?) ON CONFLICT(scope)DO UPDATE SET fingerprint=excluded.fingerprint,last_access=excluded.last_access,bytes=excluded.bytes").bind(&index.scope).bind(&index.fingerprint).bind(index.indexed_at).bind(bytes).execute(&mut *transaction).await?;
        transaction.commit().await?;
        self.prune_disk().await
    }
    pub(super) async fn prune_disk(&self) -> BackendResult<()> {
        let mut transaction = self.pool.begin().await?;
        let rows=sqlx::query("SELECT scope,last_access,bytes FROM analysis_cache_workspaces ORDER BY last_access DESC,scope").fetch_all(&mut *transaction).await?;
        let mut total = 0i64;
        let mut retained = 0usize;
        let cutoff = chrono::Utc::now().timestamp_millis() - TTL_MS;
        for row in rows {
            let size: i64 = row.try_get("bytes")?;
            if retained < 32
                && row.try_get::<i64, _>("last_access")? >= cutoff
                && total.saturating_add(size.max(0)) <= MAX_DISK
            {
                total = total.saturating_add(size.max(0));
                retained += 1;
                continue;
            }
            let scope: String = row.try_get("scope")?;
            sqlx::query("DELETE FROM analysis_cache_documents WHERE scope=?")
                .bind(&scope)
                .execute(&mut *transaction)
                .await?;
            sqlx::query("DELETE FROM analysis_fts WHERE scope=?")
                .bind(&scope)
                .execute(&mut *transaction)
                .await?;
            sqlx::query("DELETE FROM analysis_cache_graphs WHERE scope=?")
                .bind(&scope)
                .execute(&mut *transaction)
                .await?;
            sqlx::query("DELETE FROM analysis_cache_workspaces WHERE scope=?")
                .bind(&scope)
                .execute(&mut *transaction)
                .await?;
        }
        transaction.commit().await?;
        Ok(())
    }
    pub(super) async fn persisted_index_matches(&self, index: &Index) -> bool {
        let fingerprint = sqlx::query_scalar::<_, String>(
            "SELECT fingerprint FROM analysis_cache_workspaces WHERE scope=?",
        )
        .bind(&index.scope)
        .fetch_optional(&self.pool)
        .await
        .ok()
        .flatten();
        let count = sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM analysis_fts WHERE scope=?")
            .bind(&index.scope)
            .fetch_one(&self.pool)
            .await
            .ok();
        fingerprint.is_some_and(|fingerprint| fingerprint == index.fingerprint)
            && count == Some(index.files.len() as i64)
    }
}
