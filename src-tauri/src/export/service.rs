use super::{
  render,
  types::{ChapterRequest, ExportTaskEvent, PublicationOptions},
};
use crate::error::{BackendError, BackendResult};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::platform::save_paths::SavePathGrant;
use crate::workspace::Workspace;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tokio::sync::Semaphore;

struct Task {
  owner: String,
  cancelled: AtomicBool,
  // One atomic transition arbitrates cancellation versus the final disk write.
  state: AtomicU8,
  window: WebviewWindow,
  event: ExportTaskEvent,
}
struct Inner {
  tasks: Mutex<HashMap<String, Arc<Task>>>,
  outputs: Mutex<HashMap<PathBuf, String>>,
  queue: Arc<Semaphore>,
}
#[derive(Clone)]
pub struct ExportService {
  inner: Arc<Inner>,
}

impl Default for ExportService {
  fn default() -> Self {
    Self {
      inner: Arc::new(Inner {
        tasks: Mutex::new(HashMap::new()),
        outputs: Mutex::new(HashMap::new()),
        queue: Arc::new(Semaphore::new(1)),
      }),
    }
  }
}

impl ExportService {
  pub fn queue(
    &self,
    window: WebviewWindow,
    workspace: Arc<Workspace>,
    chapters: Vec<ChapterRequest>,
    options: PublicationOptions,
    output: PathBuf,
    mut grant: SavePathGrant,
  ) -> BackendResult<String> {
    let id = format!(
      "export-{}-{}",
      options.format.extension(),
      uuid::Uuid::new_v4()
    );
    let event = ExportTaskEvent {
      id: id.clone(),
      format: options.format,
      output_path: output.to_string_lossy().into_owned(),
      status: "started".into(),
      progress: Some(0.05),
      message: "Export queued".into(),
    };
    let task = Arc::new(Task {
      owner: window.label().into(),
      cancelled: AtomicBool::new(false),
      state: AtomicU8::new(0),
      window: window.clone(),
      event: event.clone(),
    });
    {
      let mut tasks = self.inner.tasks.lock().map_err(|_| state_error())?;
      if tasks.len() >= 8 {
        return Err(BackendError::new("EXPORT_BUSY", "Export queue is full"));
      }
      tasks.insert(id.clone(), task.clone());
    }
    emit(&window, &event);
    let service = self.clone();
    tauri::async_runtime::spawn(async move {
      let result = async {
        let _permit = service
          .inner
          .queue
          .clone()
          .acquire_owned()
          .await
          .map_err(|_| state_error())?;
        super::check_cancelled(&task.cancelled)?;
        // Only the running task reads documents and images. Waiting
        // exports keep paths and grants, avoiding eager memory growth.
        let mut documents = Vec::new();
        let mut text_bytes = 0;
        let mut image_bytes = 0;
        let registry = window.state::<crate::workspace::WorkspaceRegistry>();
        let snapshot_guard = registry.lock_binding(window.label(), &workspace).await?;
        for chapter in chapters {
          super::check_cancelled(&task.cancelled)?;
          let document = super::commands::source(&workspace, chapter).await?;
          text_bytes += document.markdown.len();
          image_bytes += document.assets.values().map(Vec::len).sum::<usize>();
          if text_bytes > 64 * 1024 * 1024 || image_bytes > 100 * 1024 * 1024 {
            return Err(BackendError::new(
              "FILE_TOO_LARGE",
              "Publication exceeds export resource limits",
            ));
          }
          documents.push(document);
        }
        drop(snapshot_guard);
        let thread_task = task.clone();
        let thread_window = window.clone();
        let mut thread_event = event.clone();
        tokio::task::spawn_blocking(move || {
          thread_event.progress = Some(0.15);
          thread_event.message = "Rendering export".into();
          emit(&thread_window, &thread_event);
          let bytes = render(options.format, &documents, &options, &thread_task.cancelled)?;
          // Successful cancellation can never race past this barrier.
          thread_task
            .state
            .compare_exchange(0, 2, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| BackendError::new("EXPORT_CANCELLED", "Export cancelled"))?;
          thread_event.progress = Some(0.9);
          thread_event.message = "Saving exported file".into();
          emit(&thread_window, &thread_event);
          grant.commit(&bytes)
        })
        .await
        .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", error.to_string()))?
      }
      .await;
      task.state.store(3, Ordering::Release);
      let mut event = event;
      match result {
        Ok(()) => {
          let registry = window.state::<crate::workspace::WorkspaceRegistry>();
          if registry.ensure_binding(window.label(), &workspace).is_ok()
            && let Ok(mut outputs) = service.inner.outputs.lock()
          {
            outputs.insert(output.clone(), task.owner.clone());
          }
          event.status = "finished".into();
          event.progress = Some(1.0);
          event.message = "Export finished".into();
        }
        Err(error) => {
          event.status = if error.code == "EXPORT_CANCELLED" {
            "cancelled"
          } else {
            "failed"
          }
          .into();
          event.progress = None;
          event.message = error.message;
        }
      }
      if !task.cancelled.load(Ordering::Acquire) {
        emit(&window, &event);
        if matches!(event.status.as_str(), "finished" | "failed") {
          crate::notifications::notify(
            window.app_handle(),
            crate::notifications::Request::export(
              &event.id,
              event.format.extension(),
              &output,
              &task.owner,
              event.status == "finished",
            )
            .with_owner(&window),
          );
        }
      }
      if let Ok(mut tasks) = service.inner.tasks.lock() {
        tasks.remove(&event.id);
      }
    });
    Ok(id)
  }

  pub fn cancel(&self, owner: &str, id: &str) -> BackendResult<bool> {
    let tasks = self.inner.tasks.lock().map_err(|_| state_error())?;
    let Some(task) = tasks.get(id) else {
      return Ok(false);
    };
    if task.owner != owner
      || task
        .state
        .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
      return Ok(false);
    }
    task.cancelled.store(true, Ordering::Release);
    let mut event = task.event.clone();
    event.status = "cancelled".into();
    event.progress = None;
    event.message = "Export cancelled".into();
    emit(&task.window, &event);
    Ok(true)
  }

  pub fn cancel_owner(&self, owner: &str) -> BackendResult<()> {
    let tasks = self.inner.tasks.lock().map_err(|_| state_error())?;
    for task in tasks.values().filter(|task| task.owner == owner) {
      if task
        .state
        .compare_exchange(0, 1, Ordering::AcqRel, Ordering::Acquire)
        .is_ok()
      {
        task.cancelled.store(true, Ordering::Release);
      }
    }
    self
      .inner
      .outputs
      .lock()
      .map_err(|_| state_error())?
      .retain(|_, label| label != owner);
    Ok(())
  }

  pub fn is_output(&self, owner: &str, path: &Path) -> BackendResult<bool> {
    let outputs = self.inner.outputs.lock().map_err(|_| state_error())?;
    Ok(outputs.get(path).is_some_and(|label| label == owner))
  }
}

fn emit(window: &WebviewWindow, payload: &ExportTaskEvent) {
  if let Err(error) = window.emit_to(
    tauri::EventTarget::webview_window(window.label()),
    "export-task",
    payload,
  ) {
    log::warn!("Export progress delivery failed: {error}");
  }
}
fn state_error() -> BackendError {
  BackendError::new("STATE_ERROR", "Export state is unavailable")
}
