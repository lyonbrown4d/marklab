mod cache;
mod community;
mod edge_order;
mod jobs;
mod layered;
mod packing;
#[cfg(test)]
mod tests;
mod types;
#[cfg(test)]
mod workload_tests;

pub use community::{
    GraphCommunity, GraphCommunityEdge, GraphCommunityNode, GraphCommunityRequest,
    GraphCommunityResult,
};
pub use types::*;

use crate::error::{BackendError, BackendResult};
use cache::CachedCompute;
use jobs::{ActiveJob, JobKind, Jobs};
use moka::future::Cache;
use sha2::{Digest, Sha256};
use std::{
    panic::{AssertUnwindSafe, catch_unwind},
    sync::Arc,
};
use tokio::sync::Semaphore;

pub struct GraphComputeService {
    cache: Cache<String, CachedCompute>,
    workers: Arc<Semaphore>,
    jobs: Jobs,
}

impl Default for GraphComputeService {
    fn default() -> Self {
        Self::new()
    }
}

impl GraphComputeService {
    pub fn new() -> Self {
        Self {
            cache: cache::new(),
            workers: Arc::new(Semaphore::new(2)),
            jobs: Jobs::default(),
        }
    }

    pub async fn compute_layout(
        &self,
        owner: &str,
        workspace: &str,
        mut request: GraphLayoutComputeRequest,
    ) -> BackendResult<GraphLayoutComputeResult> {
        if !types::valid_text(&request.request_id) {
            return Err(types::invalid("Invalid graph request ID"));
        }
        let active = ActiveJob::begin(&self.jobs, owner, JobKind::Layout, &request.request_id)?;
        let (owned_owner, owned_workspace) = (owner.to_owned(), workspace.to_owned());
        let preparation_job = active.job.clone();
        let preparation = crate::blocking::run(move || {
            preparation_job.check()?;
            request.normalize()?;
            let key = cache_key(&owned_owner, &owned_workspace, &request)?;
            preparation_job.check()?;
            Ok((request, key))
        });
        let (request, key) = tokio::select! {
            result = preparation => result?,
            _ = active.job.wait_cancelled() => return Err(jobs::cancelled()),
        };
        if let Some(CachedCompute::Layout(positions)) = self.cache.get(&key).await {
            active.job.check()?;
            return Ok(result(positions.as_ref().clone()));
        }
        let permit = tokio::select! {
            permit = self.workers.clone().acquire_owned() => permit.map_err(|_| failed())?,
            _ = active.job.wait_cancelled() => return Err(jobs::cancelled()),
        };
        active.job.check()?;
        let job = active.job.clone();
        let computation = crate::blocking::run(move || {
            let _permit = permit;
            job.check()?;
            let positions = compute(&request, &job)?;
            job.check()?;
            Ok(positions)
        });
        let positions = tokio::select! {
            result = computation => result?,
            _ = active.job.wait_cancelled() => return Err(jobs::cancelled()),
        };
        active.job.check()?;
        self.cache
            .insert(key, CachedCompute::Layout(Arc::new(positions.clone())))
            .await;
        active.job.check()?;
        Ok(result(positions))
    }

    pub async fn compute_communities(
        &self,
        owner: &str,
        workspace: &str,
        mut request: GraphCommunityRequest,
    ) -> BackendResult<GraphCommunityResult> {
        if !types::valid_text(&request.request_id) {
            return Err(types::invalid("Invalid graph request ID"));
        }
        let active = ActiveJob::begin(&self.jobs, owner, JobKind::Community, &request.request_id)?;
        let (owned_owner, owned_workspace) = (owner.to_owned(), workspace.to_owned());
        let preparation_job = active.job.clone();
        let preparation = crate::blocking::run(move || {
            preparation_job.check()?;
            request.normalize()?;
            let key = fingerprint(
                &owned_owner,
                &owned_workspace,
                "community",
                &(&request.nodes, &request.edges),
            )?;
            preparation_job.check()?;
            Ok((request, key))
        });
        let (request, key) = tokio::select! {
            result = preparation => result?,
            _ = active.job.wait_cancelled() => return Err(jobs::cancelled()),
        };
        if let Some(CachedCompute::Community(result)) = self.cache.get(&key).await {
            active.job.check()?;
            return Ok(result.as_ref().clone());
        }
        let permit = tokio::select! {
            permit = self.workers.clone().acquire_owned() => permit.map_err(|_| failed())?,
            _ = active.job.wait_cancelled() => return Err(jobs::cancelled()),
        };
        active.job.check()?;
        let job = active.job.clone();
        let computation = crate::blocking::run(move || {
            let _permit = permit;
            job.check()?;
            let result = catch_unwind(AssertUnwindSafe(|| {
                community::detect_communities(&request, &job.flag)
            }))
            .map_err(|_| {
                BackendError::new(
                    "GRAPH_COMMUNITY_FAILED",
                    "Native community detection failed",
                )
            })??;
            job.check()?;
            Ok(result)
        });
        let result = tokio::select! {
            result = computation => result?,
            _ = active.job.wait_cancelled() => return Err(jobs::cancelled()),
        };
        active.job.check()?;
        self.cache
            .insert(key, CachedCompute::Community(Arc::new(result.clone())))
            .await;
        active.job.check()?;
        Ok(result)
    }

    pub fn cancel(&self, owner: &str, request_id: &str) -> BackendResult<()> {
        if !types::valid_text(request_id) {
            return Err(types::invalid("Invalid layout request ID"));
        }
        jobs::cancel(&self.jobs, owner, request_id)
    }
}

fn compute(
    request: &GraphLayoutComputeRequest,
    job: &jobs::Job,
) -> BackendResult<Vec<GraphLayoutPosition>> {
    let outcome = catch_unwind(AssertUnwindSafe(|| {
        if request.mode == GraphLayoutMode::Focus
            && request.nodes.len() <= 300
            && request.edges.len() <= 600
        {
            // Third-party layered work cannot be interrupted mid-stage. Bounded
            // input and concurrency keep that synchronous work contained.
            if let Ok(Ok(positions)) = catch_unwind(AssertUnwindSafe(|| {
                layered::layout(&request.nodes, &request.edges, job)
            })) {
                return Ok(positions);
            }
            job.check()?;
        }
        packing::layout(
            &request.nodes,
            request.mode == GraphLayoutMode::Overview,
            job,
        )
    }))
    .map_err(|_| failed())??;
    if outcome.len() != request.nodes.len()
        || outcome.iter().any(|position| {
            !position.x.is_finite()
                || !position.y.is_finite()
                || position.x.abs() > 10_000_000.0
                || position.y.abs() > 10_000_000.0
        })
    {
        return Err(failed());
    }
    let mut positions = outcome;
    positions.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(positions)
}

fn cache_key(
    owner: &str,
    workspace: &str,
    request: &GraphLayoutComputeRequest,
) -> BackendResult<String> {
    // requestId identifies cancellation, while actual normalized geometry owns
    // cache validity. No renderer-provided cache key enters this digest.
    fingerprint(
        owner,
        workspace,
        "layout",
        &(request.mode, &request.nodes, &request.edges),
    )
}

fn fingerprint(
    owner: &str,
    workspace: &str,
    kind: &str,
    input: &impl serde::Serialize,
) -> BackendResult<String> {
    let mut digest = Sha256::new();
    for text in [ENGINE_VERSION, owner, workspace, kind] {
        digest.update((text.len() as u64).to_le_bytes());
        digest.update(text.as_bytes());
    }
    // Hash directly into the digest rather than allocating another JSON copy
    // of the topology with potentially long endpoint IDs.
    serde_json::to_writer(HashWriter(&mut digest), input)?;
    Ok(hex::encode(digest.finalize()))
}

struct HashWriter<'a>(&'a mut Sha256);

impl std::io::Write for HashWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn result(positions: Vec<GraphLayoutPosition>) -> GraphLayoutComputeResult {
    GraphLayoutComputeResult {
        positions,
        engine_version: ENGINE_VERSION,
    }
}

fn failed() -> BackendError {
    BackendError::new("graph_layout_failed", "Native graph layout failed")
}
