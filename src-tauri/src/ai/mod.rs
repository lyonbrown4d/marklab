mod commands;
mod generation;
#[cfg(test)]
mod generation_tests;
#[cfg(test)]
mod http_fixture;
mod jobs;
mod policy;
mod prompt;
mod providers;
#[cfg(test)]
mod response_tests;
mod sampling;
mod sdk;
pub(crate) mod secrets;
#[cfg(test)]
mod tests;
mod transport;
mod types;
use crate::error::{BackendError, BackendResult};
pub use commands::*;
use sqlx::SqlitePool;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::{Mutex, Semaphore, watch};
pub use types::*;
#[derive(Clone)]
pub struct AiService {
  inner: Arc<Inner>,
}
struct Inner {
  pool: SqlitePool,
  client: reqwest::Client,
  mutation: Mutex<()>,
  jobs: Mutex<HashMap<String, Job>>,
  attempts: Mutex<HashMap<(String, String), String>>,
  queue: Arc<Semaphore>,
  workers: Semaphore,
}
struct Job {
  owner: String,
  session: Option<String>,
  channel: &'static str,
  cancel: watch::Sender<bool>,
}
impl AiService {
  pub async fn new(pool: SqlitePool) -> BackendResult<Self> {
    sqlx::query("CREATE TABLE IF NOT EXISTS ai_providers(id TEXT PRIMARY KEY, metadata_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,secret_ref TEXT)").execute(&pool).await?;
    let client = reqwest::Client::builder()
      .redirect(reqwest::redirect::Policy::none())
      .connect_timeout(Duration::from_secs(10))
      .timeout(Duration::from_secs(120))
      .build()
      .map_err(|_| {
        BackendError::new(
          "AI_CLIENT_ERROR",
          "AI network client could not be initialized",
        )
      })?;
    Ok(Self {
      inner: Arc::new(Inner {
        pool,
        client,
        mutation: Mutex::new(()),
        jobs: Mutex::new(HashMap::new()),
        attempts: Mutex::new(HashMap::new()),
        queue: Arc::new(Semaphore::new(8)),
        workers: Semaphore::new(2),
      }),
    })
  }
}
