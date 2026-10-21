use super::{graph_types::*, query_types::*};
use serde::Serialize;
use std::sync::Arc;

// Cache each concrete projection once. Returning a result only clones its Arc.
#[derive(Clone)]
pub(super) enum CachedProjection {
  Pages(Arc<PageResult>),
  Navigation(Arc<NavigationResult>),
  Insights(Arc<InsightsResult>),
  Summary(Arc<KnowledgeSummary>),
  Graph(Arc<WorkspaceGraph>),
  Details(Arc<GraphDetails>),
  Publication(Arc<PublicationPlan>),
}
pub(super) trait Projection: Serialize + Send + Sync + Sized + 'static {
  const KIND: &'static str;
  fn into_cached(value: Arc<Self>) -> CachedProjection;
  fn from_cached(value: &CachedProjection) -> Option<Arc<Self>>;
}
macro_rules! projection {
  ($type:ty, $variant:ident, $kind:literal) => {
    impl Projection for $type {
      const KIND: &'static str = $kind;
      fn into_cached(value: Arc<Self>) -> CachedProjection {
        CachedProjection::$variant(value)
      }
      fn from_cached(value: &CachedProjection) -> Option<Arc<Self>> {
        match value {
          CachedProjection::$variant(value) => Some(value.clone()),
          _ => None,
        }
      }
    }
  };
}
projection!(PageResult, Pages, "pages");
projection!(NavigationResult, Navigation, "navigation");
projection!(InsightsResult, Insights, "insights");
projection!(KnowledgeSummary, Summary, "summary");
projection!(WorkspaceGraph, Graph, "graph");
projection!(GraphDetails, Details, "details");
projection!(PublicationPlan, Publication, "publication");
impl CachedProjection {
  pub fn weight(&self) -> u32 {
    match self {
      Self::Pages(value) => weight(value.as_ref()),
      Self::Navigation(value) => weight(value.as_ref()),
      Self::Insights(value) => weight(value.as_ref()),
      Self::Summary(value) => weight(value.as_ref()),
      Self::Graph(value) => weight(value.as_ref()),
      Self::Details(value) => weight(value.as_ref()),
      Self::Publication(value) => weight(value.as_ref()),
    }
  }
}
#[derive(Default)]
struct Counter(usize);
impl std::io::Write for Counter {
  fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
    self.0 = self.0.saturating_add(bytes.len());
    Ok(bytes.len())
  }
  fn flush(&mut self) -> std::io::Result<()> {
    Ok(())
  }
}
fn weight<T: Serialize>(value: &T) -> u32 {
  // Count through a sink without allocating a second tree or encoded buffer.
  // The multiplier conservatively covers Vec capacity and Rust field overhead.
  let mut count = Counter::default();
  if serde_json::to_writer(&mut count, value).is_err() {
    return u32::MAX;
  }
  count
    .0
    .saturating_mul(4)
    .saturating_add(std::mem::size_of::<T>())
    .min(u32::MAX as usize) as u32
}
