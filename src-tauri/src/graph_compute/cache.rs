use super::{GraphCommunityResult, GraphLayoutPosition};
use moka::future::Cache;
use std::sync::Arc;

#[derive(Clone)]
pub(super) enum CachedCompute {
    Layout(Arc<Vec<GraphLayoutPosition>>),
    Community(Arc<GraphCommunityResult>),
}

pub(super) fn new() -> Cache<String, CachedCompute> {
    Cache::builder()
        // One shared retained-geometry budget for both computation kinds.
        .max_capacity(24_000)
        .weigher(|_: &String, value: &CachedCompute| match value {
            CachedCompute::Layout(positions) => positions.len().max(1) as u32,
            CachedCompute::Community(result) => result
                .communities
                .iter()
                .map(|community| community.node_ids.len() as u32)
                .sum::<u32>()
                .max(1),
        })
        .build()
}
