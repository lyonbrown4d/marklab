use super::projections::{CachedProjection, Projection};
use super::{
  AnalysisService, Index,
  document::Document,
  service::{QueryKey, changed},
};
use crate::error::{BackendError, BackendResult};
use serde::Serialize;
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
impl AnalysisService {
  pub(super) async fn project_cached<R: Serialize + Send + 'static, T: Projection>(
    &self,
    index: Arc<Index>,
    kind: &'static str,
    request: R,
    task: impl FnOnce(&Index, R) -> BackendResult<T> + Send + 'static,
  ) -> BackendResult<Arc<T>> {
    let bytes = serde_json::to_vec(&request)?;
    let query = format!("{}:{kind}:{}", T::KIND, hex::encode(Sha256::digest(bytes)));
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
        if T::KIND == "graph"
          && let Some(value) = self.disk_graph(&index).await
        {
          return Ok(CachedProjection::Graph(Arc::new(value)));
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
        if T::KIND == "graph"
          && self.epoch.load(Ordering::Acquire) == epoch
          && let Err(error) = self.persist_graph(&index, graph_value(&computed)?).await
        {
          log::warn!("Analysis graph cache write skipped: {}", error.code);
        }
        Ok(T::into_cached(computed))
      })
      .await
      .map_err(|error: Arc<BackendError>| (*error).clone())?;
    if self.epoch.load(Ordering::Acquire) != epoch {
      return Err(changed());
    }
    T::from_cached(&result)
      .ok_or_else(|| BackendError::new("ANALYSIS_FAILED", "Projection cache type mismatch"))
  }
}

fn graph_value<T: Projection>(
  value: &Arc<T>,
) -> BackendResult<Arc<super::graph_types::WorkspaceGraph>> {
  match T::into_cached(value.clone()) {
    CachedProjection::Graph(graph) => Ok(graph),
    _ => Err(BackendError::new(
      "ANALYSIS_FAILED",
      "Invalid graph cache projection",
    )),
  }
}
