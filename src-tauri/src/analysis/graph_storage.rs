use super::{AnalysisService, Index};
use crate::error::{BackendError, BackendResult};
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::sync::Arc;
const MAX_GRAPH: usize = 16 * 1024 * 1024;
impl AnalysisService {
    pub(super) async fn disk_graph(&self, index: &Index) -> Option<Value> {
        let row=sqlx::query("SELECT payload,payload_hash FROM analysis_cache_graphs WHERE scope=? AND fingerprint=? AND length(CAST(payload AS BLOB))<=?").bind(&index.scope).bind(&index.fingerprint).bind(MAX_GRAPH as i64).fetch_optional(&self.pool).await.ok()??;
        let payload: String = row.try_get("payload").ok()?;
        let hash: String = row.try_get("payload_hash").ok()?;
        let mut value = tokio::task::spawn_blocking(move || {
            if payload.len() > MAX_GRAPH || hex::encode(Sha256::digest(payload.as_bytes())) != hash
            {
                return None;
            }
            let value: Value = serde_json::from_str(&payload).ok()?;
            (value.is_object() && value.get("nodes")?.is_array() && value.get("edges")?.is_array())
                .then_some(value)
        })
        .await
        .ok()
        .flatten()?;
        value
            .as_object_mut()?
            .insert("revision".into(), super::graph::revision(index).into());
        Some(value)
    }
    pub(super) async fn persist_graph(
        &self,
        index: &Index,
        value: Arc<Value>,
    ) -> BackendResult<()> {
        let (payload, hash) = tokio::task::spawn_blocking(move || {
            let mut value = (*value).clone();
            if let Some(object) = value.as_object_mut() {
                object.remove("revision");
            }
            let payload = serde_json::to_string(&value)?;
            let hash = hex::encode(Sha256::digest(payload.as_bytes()));
            Ok::<_, serde_json::Error>((payload, hash))
        })
        .await
        .map_err(|error| BackendError::new("CACHE_ENCODE", error.to_string()))??;
        if payload.len() > MAX_GRAPH {
            return Ok(());
        }
        let bytes = payload.len() as i64;
        let mut transaction = self.pool.begin().await?;
        let current: Option<String> =
            sqlx::query_scalar("SELECT fingerprint FROM analysis_cache_workspaces WHERE scope=?")
                .bind(&index.scope)
                .fetch_optional(&mut *transaction)
                .await?;
        if current.as_deref() != Some(index.fingerprint.as_str()) {
            return Ok(());
        }
        sqlx::query("INSERT INTO analysis_cache_graphs(scope,fingerprint,payload,payload_hash,bytes)VALUES(?,?,?,?,?) ON CONFLICT(scope)DO UPDATE SET fingerprint=excluded.fingerprint,payload=excluded.payload,payload_hash=excluded.payload_hash,bytes=excluded.bytes").bind(&index.scope).bind(&index.fingerprint).bind(payload).bind(hash).bind(bytes).execute(&mut *transaction).await?;
        sqlx::query("UPDATE analysis_cache_workspaces SET bytes=(SELECT COALESCE(SUM(bytes),0) FROM analysis_cache_documents WHERE scope=?)+(SELECT COALESCE(SUM(bytes),0)FROM analysis_cache_graphs WHERE scope=?) WHERE scope=?").bind(&index.scope).bind(&index.scope).bind(&index.scope).execute(&mut *transaction).await?;
        transaction.commit().await?;
        self.prune_disk().await
    }
}
