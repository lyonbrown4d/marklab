use crate::error::{BackendError, BackendResult};
use std::{
  collections::BTreeMap,
  sync::{Arc, Mutex},
};
use tokio_util::sync::CancellationToken;

pub(super) type Jobs = Arc<Mutex<BTreeMap<(String, JobKind, String), Arc<Job>>>>;

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub(super) enum JobKind {
  Layout,
  Community,
}

pub(super) struct Job {
  pub(super) cancelled: CancellationToken,
}

impl Job {
  pub(super) fn new() -> Self {
    Self {
      cancelled: CancellationToken::new(),
    }
  }

  pub(super) fn cancel(&self) {
    self.cancelled.cancel();
  }

  pub(super) fn check(&self) -> BackendResult<()> {
    if self.cancelled.is_cancelled() {
      Err(cancelled())
    } else {
      Ok(())
    }
  }

  pub(super) async fn wait_cancelled(&self) {
    self.cancelled.cancelled().await;
  }
}

pub(super) fn cancelled() -> BackendError {
  BackendError::new("graph_layout_cancelled", "Graph layout was cancelled")
}

pub(super) struct ActiveJob {
  jobs: Jobs,
  key: (String, JobKind, String),
  pub(super) job: Arc<Job>,
}

impl ActiveJob {
  pub(super) fn begin(
    jobs: &Jobs,
    owner: &str,
    kind: JobKind,
    request_id: &str,
  ) -> BackendResult<Self> {
    let key = (owner.to_owned(), kind, request_id.to_owned());
    let job = Arc::new(Job::new());
    let mut pending = jobs.lock().map_err(|_| stopped())?;
    // Layout and community detection may run independently in one window.
    for ((job_owner, job_kind, _), earlier) in pending.iter() {
      if job_owner == owner && *job_kind == kind {
        earlier.cancel();
      }
    }
    pending.insert(key.clone(), job.clone());
    Ok(Self {
      jobs: jobs.clone(),
      key,
      job,
    })
  }
}

impl Drop for ActiveJob {
  fn drop(&mut self) {
    self.job.cancel();
    if let Ok(mut pending) = self.jobs.lock()
      && pending
        .get(&self.key)
        .is_some_and(|job| Arc::ptr_eq(job, &self.job))
    {
      pending.remove(&self.key);
    }
  }
}

pub(super) fn cancel(jobs: &Jobs, owner: &str, request_id: &str) -> BackendResult<()> {
  for ((job_owner, _, job_id), job) in jobs.lock().map_err(|_| stopped())?.iter() {
    if job_owner == owner && job_id == request_id {
      job.cancel();
    }
  }
  Ok(())
}

fn stopped() -> BackendError {
  BackendError::new(
    "graph_layout_failed",
    "Graph layout scheduler is unavailable",
  )
}
