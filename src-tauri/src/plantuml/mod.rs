pub mod commands;
mod render;
#[cfg(test)]
mod tests;

use crate::error::{BackendError, BackendResult};
use moka::future::Cache;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use tokio::sync::Semaphore;

pub const MAX_SOURCE_BYTES: usize = 128 * 1024;
pub const ENGINE_VERSION: &str = "puml-0.2.6";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RenderRequest {
  pub source: String,
  pub request_id: String,
}

#[derive(Clone)]
pub struct RenderedDiagram {
  pub pages: Vec<String>,
  pub warnings: Vec<String>,
}

pub struct PlantUmlService {
  cache: Cache<String, Arc<RenderedDiagram>>,
  cancelled: moka::sync::Cache<String, ()>,
  workers: Arc<Semaphore>,
  queue: Arc<Semaphore>,
}

impl Default for PlantUmlService {
  fn default() -> Self {
    Self {
      cache: Cache::builder()
        .name("plantuml-svg")
        .max_capacity(8 * 1024 * 1024)
        .weigher(|_: &String, diagram: &Arc<RenderedDiagram>| {
          diagram.pages.iter().map(String::len).sum::<usize>() as u32
        })
        .time_to_idle(Duration::from_secs(300))
        .build(),
      cancelled: moka::sync::Cache::builder()
        .max_capacity(256)
        .time_to_live(Duration::from_secs(60))
        .build(),
      workers: Arc::new(Semaphore::new(2)),
      queue: Arc::new(Semaphore::new(16)),
    }
  }
}

impl PlantUmlService {
  pub fn cancel(&self, owner: &str, request_id: &str) -> BackendResult<()> {
    validate_id(request_id)?;
    self.cancelled.insert(job_key(owner, request_id), ());
    Ok(())
  }

  pub async fn render(
    &self,
    owner: &str,
    generation: u64,
    request: RenderRequest,
  ) -> BackendResult<Arc<RenderedDiagram>> {
    validate_id(&request.request_id)?;
    render::validate(&request.source)?;
    let job = job_key(owner, &request.request_id);
    self.check(&job)?;
    let key = format!(
      "{owner}:{generation}:{ENGINE_VERSION}:{}",
      hex::encode(Sha256::digest(request.source.as_bytes()))
    );
    if let Some(diagram) = self.cache.get(&key).await {
      return Ok(diagram);
    }
    let queued = self.queue.clone().try_acquire_owned().map_err(|_| {
      BackendError::new(
        "PLANTUML_BUSY",
        "Too many queued PlantUML previews; try again",
      )
    })?;
    let permit = self
      .workers
      .clone()
      .acquire_owned()
      .await
      .map_err(|_| BackendError::new("PLANTUML_STOPPED", "PlantUML renderer is unavailable"))?;
    self.check(&job)?;
    // Identical previews queued behind another job share its native result.
    if let Some(diagram) = self.cache.get(&key).await {
      return Ok(diagram);
    }
    let cancelled = self.cancelled.clone();
    let worker_job = job.clone();
    let diagram = crate::blocking::run(move || {
      // Retain both permits until CPU work ends, even if its caller goes away.
      let (_permit, _queued) = (permit, queued);
      if cancelled.contains_key(&worker_job) {
        return Err(cancelled_error());
      }
      render::render(&request.source).map(Arc::new)
    })
    .await?;
    self.check(&job)?;
    self.cache.insert(key, diagram.clone()).await;
    Ok(diagram)
  }

  fn check(&self, job: &str) -> BackendResult<()> {
    if self.cancelled.contains_key(job) {
      Err(cancelled_error())
    } else {
      Ok(())
    }
  }
}

fn validate_id(request_id: &str) -> BackendResult<()> {
  if request_id.is_empty()
    || request_id.len() > 128
    || !request_id
      .chars()
      .all(|c| c.is_ascii_alphanumeric() || c == '-')
  {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid PlantUML request ID",
    ));
  }
  Ok(())
}

fn job_key(owner: &str, request_id: &str) -> String {
  format!("{owner}:{request_id}")
}

fn cancelled_error() -> BackendError {
  BackendError::new("PLANTUML_CANCELLED", "PlantUML preview cancelled")
}
