#[cfg(test)]
mod actor_tests;
mod policy;
#[cfg(test)]
mod tests;
use crate::error::{BackendError, BackendResult};
use futures_util::{FutureExt, StreamExt, future::BoxFuture, stream::FuturesUnordered};
use serde::Deserialize;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};

pub(super) type Bytes = Arc<Vec<u8>>;
pub(super) type Key = (String, u64, String);
type ResultSender = oneshot::Sender<BackendResult<Bytes>>;
type Operation = BoxFuture<'static, BackendResult<Bytes>>;
#[derive(Clone, Copy, Default, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
  Background,
  #[default]
  Interactive,
}
pub(super) enum Command {
  Enqueue {
    key: Key,
    id: String,
    priority: Priority,
    job: Operation,
    result: ResultSender,
  },
  Cancel {
    owner: String,
    id: String,
  },
  Promote {
    owner: String,
    id: String,
  },
  Close {
    owner: String,
    closed: Option<oneshot::Sender<()>>,
  },
}
#[derive(Clone)]
pub(super) struct CaptureQueue(mpsc::Sender<Command>);
pub(super) struct Ticket {
  receiver: oneshot::Receiver<BackendResult<Bytes>>,
  queue: CaptureQueue,
  owner: String,
  id: Option<String>,
}
pub(super) fn cancelled() -> BackendError {
  BackendError::new("PREVIEW_CANCELLED", "Web preview capture was cancelled")
}
pub(super) fn full() -> BackendError {
  BackendError::new("PREVIEW_QUEUE_FULL", "Web preview capture queue is full")
}
impl CaptureQueue {
  pub fn new() -> Self {
    // The inbox also bounds IPC submissions before the eight-job policy runs.
    let (sender, receiver) = mpsc::channel(32);
    tauri::async_runtime::spawn(run(receiver));
    Self(sender)
  }
  pub fn enqueue(
    &self,
    key: Key,
    id: String,
    priority: Priority,
    job: Operation,
  ) -> BackendResult<Ticket> {
    let (result, receiver) = oneshot::channel();
    let ticket = Ticket {
      receiver,
      queue: self.clone(),
      owner: key.0.clone(),
      id: Some(id.clone()),
    };
    self
      .0
      .try_send(Command::Enqueue {
        key,
        id,
        priority,
        job,
        result,
      })
      .map_err(|_| full())?;
    Ok(ticket)
  }
  pub async fn cancel(&self, owner: String, id: String) -> BackendResult<()> {
    self
      .0
      .send(Command::Cancel { owner, id })
      .await
      .map_err(|_| cancelled())
  }
  pub async fn promote(&self, owner: String, id: String) -> BackendResult<()> {
    self
      .0
      .send(Command::Promote { owner, id })
      .await
      .map_err(|_| cancelled())
  }
  pub async fn close(&self, owner: String) {
    let (closed, wait) = oneshot::channel();
    if self
      .0
      .send(Command::Close {
        owner,
        closed: Some(closed),
      })
      .await
      .is_ok()
    {
      let _ = wait.await;
    }
  }
}
impl Ticket {
  pub async fn wait(mut self) -> BackendResult<Bytes> {
    let result = (&mut self.receiver).await.map_err(|_| cancelled());
    self.id = None;
    result?
  }
}
impl Drop for Ticket {
  fn drop(&mut self) {
    if let Some(id) = self.id.take() {
      let queue = self.queue.clone();
      let owner = self.owner.clone();
      tauri::async_runtime::spawn(async move {
        let _ = queue.cancel(owner, id).await;
      });
    }
  }
}
async fn run(mut receiver: mpsc::Receiver<Command>) {
  let mut policy = policy::Policy::default();
  let mut running = FuturesUnordered::new();
  loop {
    while let Some((id, job, cancel)) = policy.start() {
      running.push(
        async move {
          let result = tokio::select! {
              biased;
              _ = cancel.cancelled() => Err(cancelled()),
              result = job => result,
          };
          (id, result)
        }
        .boxed(),
      );
    }
    tokio::select! {
        Some((id, result)) = running.next(), if !running.is_empty() => policy.finish(id, result),
        command = receiver.recv() => match command {
            Some(command) => policy.apply(command),
            None => break,
        }
    }
  }
}
