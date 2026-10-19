use super::{
  AnalysisService, Index,
  document::Document,
  service::{QueryKey, changed},
};
use crate::error::{BackendError, BackendResult};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::sync::{Arc, atomic::Ordering};
pub(super) fn document_weight(document: &Document) -> u32 {
  document
    .links
    .iter()
    .chain(&document.assets)
    .fold(
      document.content.len()
        + document.path.len()
        + document.title.len()
        + document
          .headings
          .iter()
          .map(|h| h.path.len() + h.slug.len() + h.text.len() + 96)
          .sum::<usize>(),
      |size, link| {
        size.saturating_add(
          link.source_path.len()
            + link.target.len()
            + link.text.len()
            + link.context.len()
            + link.target_path.as_ref().map_or(0, String::len)
            + 128,
        )
      },
    )
    .min(u32::MAX as usize) as u32
}
pub(super) fn index_weight(index: &Index) -> u32 {
  index
    .files
    .values()
    .fold(
      index
        .paths
        .iter()
        .map(|path| path.len() + 64)
        .sum::<usize>(),
      |size, document| size.saturating_add(document_weight(document) as usize + 96),
    )
    .min(u32::MAX as usize) as u32
}
pub(super) fn value_weight(value: &Value) -> u32 {
  match value {
    Value::String(value) => value.len().saturating_add(32).min(u32::MAX as usize) as u32,
    Value::Array(values) => values.iter().fold(32u32, |size, value| {
      size.saturating_add(value_weight(value)).saturating_add(16)
    }),
    Value::Object(values) => values.iter().fold(64u32, |size, (key, value)| {
      size
        .saturating_add(key.len().min(u32::MAX as usize) as u32)
        .saturating_add(value_weight(value))
        .saturating_add(48)
    }),
    _ => 16,
  }
}
impl AnalysisService {
  pub async fn project_cached<R: Serialize + Send + 'static>(
    &self,
    index: Arc<Index>,
    kind: &'static str,
    request: R,
    task: impl FnOnce(&Index, R) -> BackendResult<Value> + Send + 'static,
  ) -> BackendResult<Arc<Value>> {
    let bytes = serde_json::to_vec(&request)?;
    let query = format!("{kind}:{}", hex::encode(Sha256::digest(bytes)));
    let epoch = index.epoch;
    let key = QueryKey {
      generation: index.generation,
      revision: index.revision,
      epoch: index.epoch,
      query,
    };
    let result = self
      .queries
      .try_get_with(key, async {
        if kind == "graph"
          && let Some(value) = self.disk_graph(&index).await
        {
          return Ok(Arc::new(value));
        }
        let computed = {
          let _permit = self.workers.clone().acquire_owned().await.map_err(|_| {
            BackendError::new("ANALYSIS_FAILED", "Analysis workers are unavailable")
          })?;
          let input = index.clone();
          Arc::new(
            tokio::task::spawn_blocking(move || task(&input, request))
              .await
              .map_err(|error| BackendError::new("ANALYSIS_FAILED", error.to_string()))??,
          )
        };
        if kind == "graph"
          && self.epoch.load(Ordering::Acquire) == epoch
          && let Err(error) = self.persist_graph(&index, computed.clone()).await
        {
          log::warn!("Analysis graph cache write skipped: {}", error.code);
        }
        Ok(computed)
      })
      .await
      .map_err(|error: Arc<BackendError>| (*error).clone())?;
    if self.epoch.load(Ordering::Acquire) != epoch {
      return Err(changed());
    }
    Ok(result)
  }
}
