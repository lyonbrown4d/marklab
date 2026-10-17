//! A small shared budget for filesystem and CPU jobs that cannot run on Tokio workers.
use crate::error::{BackendError, BackendResult};
use std::sync::{Arc, LazyLock};
use tokio::sync::Semaphore;
static WORKERS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(4)));

pub async fn run<T, F>(job: F) -> BackendResult<T>
where
    T: Send + 'static,
    F: FnOnce() -> BackendResult<T> + Send + 'static,
{
    let permit = WORKERS
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| BackendError::new("TASK_STOPPED", "Desktop worker budget closed"))?;
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        job()
    })
    .await
    .map_err(|error| BackendError::new("TASK_FAILED", error.to_string()))?
}
