mod process;
use process::create;
#[cfg(test)]
use process::drain_utf8;
mod shell;
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  error::{BackendError, BackendResult},
  workspace::WorkspaceRegistry,
};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::{
  collections::HashMap,
  io::{Read, Write},
  sync::{
    Arc, LazyLock, Mutex,
    atomic::{AtomicBool, Ordering},
  },
};
use tauri::{Emitter, State};
fn failure(message: impl ToString) -> BackendError {
  BackendError::new("terminal_error", message.to_string())
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateRequest {
  rows: i64,
  cols: i64,
  cwd: Option<String>,
  shell_path: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WriteRequest {
  id: String,
  data: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ResizeRequest {
  id: String,
  rows: i64,
  cols: i64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseRequest {
  id: String,
}
#[derive(Clone, Serialize)]
pub struct SessionInfo {
  id: String,
  shell: String,
  cwd: String,
}
#[derive(Clone, Serialize)]
struct Output {
  id: String,
  data: String,
}
#[derive(Clone, Serialize)]
struct Exit {
  id: String,
  exit_code: Option<u32>,
  signal: Option<String>,
}
struct Session {
  owner: String,
  master: Mutex<Box<dyn MasterPty + Send>>,
  writer: Mutex<Box<dyn Write + Send>>,
  killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
  input_gate: Arc<tokio::sync::Semaphore>,
}
#[derive(Default)]
struct OwnerEpoch {
  generation: u64,
  closed: bool,
}
#[derive(Clone, Default)]
pub struct TerminalState {
  sessions: Arc<Mutex<HashMap<String, Arc<Session>>>>,
  owners: Arc<Mutex<HashMap<String, OwnerEpoch>>>,
  stopped: Arc<AtomicBool>,
}
impl TerminalState {
  fn epoch(&self, owner: &str) -> BackendResult<u64> {
    let mut owners = self.owners.lock().map_err(failure)?;
    let current = owners.entry(owner.into()).or_default();
    if self.stopped.load(Ordering::Acquire) || current.closed {
      return Err(failure("Terminal window has closed"));
    }
    Ok(current.generation)
  }
  pub fn reopen_window(&self, owner: &str) -> BackendResult<()> {
    let mut owners = self.owners.lock().map_err(failure)?;
    if self.stopped.load(Ordering::Acquire) {
      return Err(failure("Terminal service has stopped"));
    }
    owners.entry(owner.into()).or_default().closed = false;
    Ok(())
  }

  fn session(&self, id: &str, owner: &str) -> BackendResult<Arc<Session>> {
    self
      .sessions
      .lock()
      .map_err(failure)?
      .get(id)
      .filter(|s| s.owner == owner)
      .cloned()
      .ok_or_else(|| failure("Terminal session not found for this window"))
  }
  pub fn close_window(&self, owner: &str) {
    if let Ok(mut owners) = self.owners.lock() {
      let current = owners.entry(owner.into()).or_default();
      current.generation = current.generation.saturating_add(1);
      current.closed = true;
    }
    if let Ok(mut sessions) = self.sessions.lock() {
      let ids: Vec<_> = sessions
        .iter()
        .filter(|(_, s)| s.owner == owner)
        .map(|(id, _)| id.clone())
        .collect();
      for id in ids {
        if let Some(session) = sessions.remove(&id)
          && let Ok(mut killer) = session.killer.lock()
        {
          let _ = killer.kill();
        }
      }
    }
  }
  pub fn dispose(&self) {
    let _owners = self.owners.lock().ok();
    self.stopped.store(true, Ordering::Release);
    if let Ok(mut sessions) = self.sessions.lock() {
      for (_, session) in sessions.drain() {
        if let Ok(mut killer) = session.killer.lock() {
          let _ = killer.kill();
        }
      }
    }
  }
}
fn size(rows: i64, cols: i64) -> PtySize {
  PtySize {
    rows: rows.clamp(8, 200) as u16,
    cols: cols.clamp(20, 400) as u16,
    pixel_width: 0,
    pixel_height: 0,
  }
}
#[tauri::command]
pub async fn terminal_create(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  state: State<'_, TerminalState>,
  request: CreateRequest,
) -> BackendResult<SessionInfo> {
  let workspace = registry.get(window.label())?;
  let _workspace_guard = workspace.mutation.lock().await;
  workspace.ensure_active()?;
  if !Arc::ptr_eq(&registry.get(window.label())?, &workspace) {
    return Err(failure("Workspace changed while opening terminal"));
  }
  let epoch = state.epoch(window.label())?;
  let terminal_workspace = workspace.clone();
  let owner = window.label().to_owned();
  let state = state.inner().clone();
  crate::blocking::run(move || {
    terminal_workspace.ensure_active()?;
    let cwd = if let Some(path) = request.cwd {
      terminal_workspace.resolve(&path)?
    } else {
      terminal_workspace.root_directory()
    };
    if !cwd.is_dir() {
      return Err(failure("Terminal working directory must be a directory"));
    }
    create(
      window,
      state,
      process::SpawnRequest {
        owner,
        cwd,
        rows: request.rows,
        cols: request.cols,
        shell_path: request.shell_path,
        epoch,
      },
    )
  })
  .await
}
#[tauri::command]
pub async fn terminal_write(
  window: WebviewWindow,
  state: State<'_, TerminalState>,
  request: WriteRequest,
) -> BackendResult<()> {
  if request.data.len() > 1024 * 1024 {
    return Err(failure("Terminal input exceeds the safe limit"));
  }
  let session = state.session(&request.id, window.label())?;
  let session_permit = session
    .input_gate
    .clone()
    .acquire_owned()
    .await
    .map_err(failure)?;
  let permit = WRITES.clone().acquire_owned().await.map_err(failure)?;
  tokio::task::spawn_blocking(move || {
    let (_permit, _session_permit) = (permit, session_permit);
    let mut writer = session.writer.lock().map_err(failure)?;
    writer.write_all(request.data.as_bytes())?;
    writer.flush()?;
    Ok(())
  })
  .await
  .map_err(failure)?
}
#[tauri::command]
pub async fn terminal_resize(
  window: WebviewWindow,
  state: State<'_, TerminalState>,
  request: ResizeRequest,
) -> BackendResult<()> {
  let session = state.session(&request.id, window.label())?;
  crate::blocking::run(move || {
    session
      .master
      .lock()
      .map_err(failure)?
      .resize(size(request.rows, request.cols))
      .map_err(failure)
  })
  .await
}
#[tauri::command]
pub async fn terminal_close(
  window: WebviewWindow,
  state: State<'_, TerminalState>,
  request: CloseRequest,
) -> BackendResult<()> {
  let state = state.inner().clone();
  let owner = window.label().to_owned();
  crate::blocking::run(move || {
    let mut sessions = state.sessions.lock().map_err(failure)?;
    if let Some(session) = sessions.get(&request.id)
      && session.owner != owner
    {
      return Err(failure("Terminal session not found for this window"));
    }
    if let Some(session) = sessions.remove(&request.id) {
      session
        .killer
        .lock()
        .map_err(failure)?
        .kill()
        .map_err(failure)?;
    }
    Ok(())
  })
  .await
}
#[cfg(test)]
mod tests;

// Independent budget leaves filesystem workers available to close a PTY with blocked input.
static WRITES: LazyLock<Arc<tokio::sync::Semaphore>> =
  LazyLock::new(|| Arc::new(tokio::sync::Semaphore::new(8)));
