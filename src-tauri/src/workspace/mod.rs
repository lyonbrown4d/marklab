mod autosave;
mod buffer_commands;
mod buffers;
pub mod commands;
mod events;
pub mod guide;
mod operations;
mod patches;
mod paths;
mod registry;
mod root;
mod saving;
mod scanning;
pub mod tasks;
pub mod tree;
pub mod types;
mod watcher;

pub use registry::WorkspaceRegistry;
pub use types::{BufferStatus, EmptyRequest, Entry, PathRequest, RootInfo, Snapshot};

use crate::error::{BackendError, BackendResult};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
use tokio::sync::Mutex;
use types::Buffer;

pub fn safe_asset_path(workspace: &Workspace, path: &str) -> BackendResult<PathBuf> {
  workspace.ensure_active()?;
  paths::resolve(&workspace.root_directory(), path)
}

pub struct Workspace {
  root: RwLock<RootInfo>,
  pub generation: u64,
  pub revision: AtomicU64,
  pub buffers: Arc<Mutex<BTreeMap<String, Buffer>>>,
  pub mutation: Mutex<()>,
  // Canonical roots may overlap (folder and single-file windows). Serialize
  // only the final disk compare-and-replace across those distinct sessions.
  pub(crate) commit_gate: Arc<Mutex<()>>,
  active: Arc<AtomicBool>,
  watcher: std::sync::Mutex<Option<notify::RecommendedWatcher>>,
  watcher_start: Mutex<()>,
  watcher_busy: AtomicBool,
  history: Option<crate::history::HistoryStore>,
  saving: AtomicBool,
  save_error: std::sync::Mutex<Option<String>>,
  save_request: AtomicU64,
  autosave_running: AtomicBool,
  path_snapshots: moka::future::Cache<u64, Arc<Vec<Entry>>>,
}

impl Workspace {
  pub fn new(root: RootInfo, generation: u64) -> Self {
    Self {
      root: RwLock::new(root),
      generation,
      revision: AtomicU64::new(0),
      buffers: Arc::new(Mutex::new(BTreeMap::new())),
      mutation: Mutex::new(()),
      commit_gate: Arc::new(Mutex::new(())),
      active: Arc::new(AtomicBool::new(true)),
      watcher: std::sync::Mutex::new(None),
      watcher_start: Mutex::new(()),
      watcher_busy: AtomicBool::new(false),
      history: None,
      saving: AtomicBool::new(false),
      save_error: std::sync::Mutex::new(None),
      save_request: AtomicU64::new(0),
      autosave_running: AtomicBool::new(false),
      path_snapshots: moka::future::Cache::builder()
        .name("workspace-path-snapshots")
        .max_capacity(16 * 1024 * 1024)
        .weigher(|_: &u64, entries: &Arc<Vec<Entry>>| {
          entries.iter().fold(0u32, |size, entry| {
            size.saturating_add(
              (entry.path.len() + entry.name.len() + 96).min(u32::MAX as usize) as u32,
            )
          })
        })
        .time_to_live(std::time::Duration::from_secs(30))
        .build(),
    }
  }

  pub fn with_history(root: RootInfo, generation: u64, pool: sqlx::SqlitePool) -> Self {
    let mut workspace = Self::new(root, generation);
    workspace.history = Some(crate::history::HistoryStore::new(pool));
    workspace
  }

  pub fn root_info(&self) -> RootInfo {
    self
      .root
      .read()
      .unwrap_or_else(|error| error.into_inner())
      .clone()
  }

  pub fn root_directory(&self) -> PathBuf {
    let root = self.root_info();
    let path = PathBuf::from(&root.path);
    if root.kind == "single" {
      path.parent().map(PathBuf::from).unwrap_or(path)
    } else {
      path
    }
  }

  pub fn ensure_active(&self) -> BackendResult<()> {
    if self.active.load(Ordering::Acquire) {
      Ok(())
    } else {
      Err(BackendError::new("STALE_SESSION", "Workspace has changed"))
    }
  }

  pub fn resolve(&self, value: &str) -> BackendResult<PathBuf> {
    self.ensure_active()?;
    let target = paths::resolve(&self.root_directory(), value)?;
    let root = self.root_info();
    if root.kind == "single" {
      let file = PathBuf::from(&root.path).canonicalize()?;
      if target.canonicalize().ok().as_ref() != Some(&file) {
        return Err(BackendError::new(
          "INVALID_PATH",
          "Single-file workspace cannot access another document",
        ));
      }
    }
    Ok(target)
  }

  pub async fn resolve_async(&self, value: &str) -> BackendResult<PathBuf> {
    self.ensure_active()?;
    let root = self.root_info();
    let value = value.to_owned();
    let target = crate::blocking::run(move || {
      let path = PathBuf::from(&root.path);
      let directory = if root.kind == "single" {
        path.parent().map(PathBuf::from).unwrap_or(path.clone())
      } else {
        path.clone()
      };
      let target = paths::resolve(&directory, &value)?;
      if root.kind == "single" && target != path {
        return Err(BackendError::new(
          "INVALID_PATH",
          "Single-file workspace cannot access another document",
        ));
      }
      Ok(target)
    })
    .await?;
    self.ensure_active()?;
    Ok(target)
  }

  pub fn deactivate(&self) {
    self.active.store(false, Ordering::Release);
    if let Ok(mut watcher) = self.watcher.lock()
      && let Some(watcher) = watcher.take()
    {
      tauri::async_runtime::spawn(async move {
        let _ = crate::blocking::run(move || {
          drop(watcher);
          Ok(())
        })
        .await;
      });
    }
  }

  fn rename_single_root(&self, target: PathBuf) {
    let mut root = self.root.write().unwrap_or_else(|error| error.into_inner());
    root.path = target.to_string_lossy().into_owned();
  }

  pub fn current_revision(&self) -> u64 {
    self.revision.load(Ordering::Acquire)
  }

  pub fn next_revision(&self) -> u64 {
    self.revision.fetch_add(1, Ordering::AcqRel) + 1
  }
}

#[cfg(test)]
mod lifecycle_tests;
#[cfg(test)]
mod shared_tests;
#[cfg(test)]
mod tests;
