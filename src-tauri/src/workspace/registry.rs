use super::root::prepare_root;
use super::{RootInfo, Workspace};
use crate::error::{BackendError, BackendResult};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, RwLock};

pub struct WorkspaceRegistry {
  windows: RwLock<HashMap<String, Arc<Workspace>>>,
  internal: PathBuf,
  generation: AtomicU64,
  history_pool: Option<sqlx::SqlitePool>,
  shutdown: AtomicBool,
  closing: std::sync::Mutex<HashSet<String>>,
  commit_gate: Arc<tokio::sync::Mutex<()>>,
}

impl WorkspaceRegistry {
  pub fn new(app_data: &Path) -> BackendResult<Self> {
    let internal = app_data.join("workspace");
    std::fs::create_dir_all(&internal)?;
    Ok(Self {
      windows: RwLock::new(HashMap::new()),
      internal,
      generation: AtomicU64::new(1),
      history_pool: None,
      shutdown: AtomicBool::new(false),
      closing: std::sync::Mutex::new(HashSet::new()),
      commit_gate: Arc::new(tokio::sync::Mutex::new(())),
    })
  }

  pub fn with_history(app_data: &Path, pool: sqlx::SqlitePool) -> BackendResult<Self> {
    let mut registry = Self::new(app_data)?;
    registry.history_pool = Some(pool);
    Ok(registry)
  }

  pub fn get(&self, label: &str) -> BackendResult<Arc<Workspace>> {
    self
      .windows
      .read()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?
      .get(label)
      .cloned()
      .ok_or_else(|| BackendError::new("STALE_SESSION", "Window workspace is unavailable"))
  }

  // Call while holding this workspace's mutation guard. An active shared
  // workspace alone does not prove the requesting window still owns it.
  pub fn ensure_binding(&self, label: &str, workspace: &Arc<Workspace>) -> BackendResult<()> {
    if !Arc::ptr_eq(&self.get(label)?, workspace) {
      return Err(BackendError::new(
        "STALE_SESSION",
        "Window workspace has changed",
      ));
    }
    workspace.ensure_active()
  }

  pub async fn lock_binding<'a>(
    &self,
    label: &str,
    workspace: &'a Arc<Workspace>,
  ) -> BackendResult<tokio::sync::MutexGuard<'a, ()>> {
    let guard = workspace.mutation.lock().await;
    self.ensure_binding(label, workspace)?;
    Ok(guard)
  }

  pub fn open(
    &self,
    label: &str,
    path: Option<&str>,
    single: bool,
  ) -> BackendResult<Arc<Workspace>> {
    self.ensure_opening_label(label)?;
    let root = prepare_root(path, single, &self.internal)?;
    let mut windows = self
      .windows
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?;
    self.ensure_opening_label(label)?;
    Ok(self.bind(&mut windows, label, root))
  }

  pub async fn open_async(
    &self,
    label: &str,
    path: Option<&str>,
    single: bool,
  ) -> BackendResult<Arc<Workspace>> {
    self.ensure_opening_label(label)?;
    let previous = self.get(label).ok();
    // Holding the previous workspace gate through replacement prevents an
    // accepted edit from being published after the final old-session flush.
    let _mutation = if let Some(previous) = &previous {
      Some(previous.mutation.lock().await)
    } else {
      None
    };
    if let Some(previous) = &previous {
      previous.flush_buffers_under_lock().await?;
    }
    let path = path.map(String::from);
    let internal = self.internal.clone();
    let root =
      crate::blocking::run(move || prepare_root(path.as_deref(), single, &internal)).await?;
    let mut windows = self
      .windows
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?;
    let matches = match (windows.get(label), previous.as_ref()) {
      (Some(current), Some(previous)) => Arc::ptr_eq(current, previous),
      (None, None) => true,
      _ => false,
    };
    if !matches {
      return Err(BackendError::new(
        "STALE_SESSION",
        "Another operation changed this workspace",
      ));
    }
    self.ensure_opening_label(label)?;
    Ok(self.bind(&mut windows, label, root))
  }

  fn bind(
    &self,
    windows: &mut HashMap<String, Arc<Workspace>>,
    label: &str,
    root: RootInfo,
  ) -> Arc<Workspace> {
    let workspace = windows
      .values()
      .find(|workspace| workspace.root_info() == root)
      .cloned()
      .unwrap_or_else(|| {
        let generation = self.generation.fetch_add(1, Ordering::AcqRel);
        let mut workspace = if let Some(pool) = &self.history_pool {
          Workspace::with_history(root, generation, pool.clone())
        } else {
          Workspace::new(root, generation)
        };
        workspace.commit_gate = self.commit_gate.clone();
        Arc::new(workspace)
      });
    if let Some(previous) = windows.insert(label.into(), workspace.clone())
      && !windows
        .values()
        .any(|current| Arc::ptr_eq(current, &previous))
    {
      previous.deactivate();
    }
    workspace
  }

  pub fn owners(&self, generation: u64) -> BackendResult<Vec<String>> {
    Ok(
      self
        .windows
        .read()
        .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?
        .iter()
        .filter(|(_, workspace)| workspace.generation == generation)
        .map(|(label, _)| label.clone())
        .collect(),
    )
  }

  pub async fn start_watcher(&self, label: &str, app: tauri::AppHandle) -> BackendResult<()> {
    self.get(label)?.start_watcher(app, label.to_owned()).await
  }

  pub fn begin_shutdown(&self) -> BackendResult<()> {
    let _windows = self
      .windows
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?;
    if self.shutdown.swap(true, Ordering::AcqRel) {
      return Err(BackendError::new(
        "APP_CLOSING",
        "Application shutdown is already in progress",
      ));
    }
    Ok(())
  }
  pub fn cancel_shutdown(&self) {
    self.shutdown.store(false, Ordering::Release);
  }
  pub fn begin_close(&self, label: &str) -> BackendResult<()> {
    let _windows = self
      .windows
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?;
    self
      .closing
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Window close state unavailable"))?
      .insert(label.into());
    Ok(())
  }
  pub fn cancel_close(&self, label: &str) {
    if let Ok(mut closing) = self.closing.lock() {
      closing.remove(label);
    }
  }
  pub fn allow_open(&self, label: &str) -> BackendResult<()> {
    self.ensure_opening()?;
    self.cancel_close(label);
    Ok(())
  }
  fn ensure_opening_label(&self, label: &str) -> BackendResult<()> {
    self.ensure_opening()?;
    if self
      .closing
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Window close state unavailable"))?
      .contains(label)
    {
      return Err(BackendError::new(
        "WINDOW_CLOSING",
        "The target window is closing",
      ));
    }
    Ok(())
  }
  fn ensure_opening(&self) -> BackendResult<()> {
    if self.shutdown.load(Ordering::Acquire) {
      Err(BackendError::new(
        "APP_CLOSING",
        "Cannot open a workspace while the application is closing",
      ))
    } else {
      Ok(())
    }
  }

  pub fn labels(&self) -> BackendResult<Vec<String>> {
    Ok(
      self
        .windows
        .read()
        .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?
        .keys()
        .cloned()
        .collect(),
    )
  }

  pub async fn close_async(&self, label: &str) -> BackendResult<()> {
    let previous = self.get(label)?;
    let _mutation = previous.mutation.lock().await;
    previous.flush_buffers_under_lock().await?;
    let mut windows = self
      .windows
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?;
    if !windows
      .get(label)
      .is_some_and(|current| Arc::ptr_eq(current, &previous))
    {
      return Err(BackendError::new(
        "STALE_SESSION",
        "Workspace changed while closing",
      ));
    }
    windows.remove(label);
    self
      .closing
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Window close state unavailable"))?
      .insert(label.into());
    if !windows
      .values()
      .any(|current| Arc::ptr_eq(current, &previous))
    {
      previous.deactivate();
    }
    Ok(())
  }

  pub fn close(&self, label: &str) -> BackendResult<()> {
    let mut windows = self
      .windows
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace registry lock failed"))?;
    if let Some(workspace) = windows.remove(label) {
      self
        .closing
        .lock()
        .map_err(|_| BackendError::new("STATE_ERROR", "Window close state unavailable"))?
        .insert(label.into());
      if !windows
        .values()
        .any(|current| Arc::ptr_eq(current, &workspace))
      {
        workspace.deactivate();
      }
    }
    Ok(())
  }
}
