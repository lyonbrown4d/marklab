use super::Workspace;
use crate::error::{BackendError, BackendResult};
use notify::{RecursiveMode, Watcher};
use std::{
  collections::BTreeSet,
  path::{Path, PathBuf},
  sync::Arc,
  time::Duration,
};
use tauri::Manager;

const MAX_BATCH_PATHS: usize = 4096;
const EVENT_QUEUE_CAPACITY: usize = 256;

impl Workspace {
  pub(super) async fn start_watcher(
    self: Arc<Self>,
    app: tauri::AppHandle,
    _owner: String,
  ) -> BackendResult<()> {
    self.ensure_active()?;
    let _starting = self.watcher_start.lock().await;
    if self
      .watcher
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Watcher lock failed"))?
      .is_some()
    {
      return Ok(());
    }
    let root = self.root_directory();
    let (watcher, mut receiver, overflow) = watch_directory(
      root,
      self.root_info().kind != crate::workspace::RootKind::Single,
    )
    .await?;
    let workspace = self.clone();
    crate::blocking::run(move || {
      let mut slot = workspace
        .watcher
        .lock()
        .map_err(|_| BackendError::new("STATE_ERROR", "Watcher lock failed"))?;
      workspace.ensure_active()?;
      *slot = Some(watcher);
      Ok(())
    })
    .await?;
    let weak = Arc::downgrade(&self);
    tauri::async_runtime::spawn(async move {
      while let Some(first) = receiver.recv().await {
        let Some(workspace) = weak.upgrade() else {
          break;
        };
        if workspace.ensure_active().is_err() {
          break;
        }
        let mut paths = BTreeSet::new();
        let mut invalidated = overflow.swap(false, std::sync::atomic::Ordering::AcqRel);
        let mut git_changed = invalidated;
        let root = workspace.root_directory();
        git_changed |= collect(first, &root, &mut paths, &mut invalidated);
        tokio::time::sleep(Duration::from_millis(120)).await;
        // A continuously refilled channel must not starve refresh/publication.
        for _ in 0..EVENT_QUEUE_CAPACITY {
          let Ok(event) = receiver.try_recv() else {
            break;
          };
          git_changed |= collect(event, &root, &mut paths, &mut invalidated);
        }
        invalidated |= overflow.swap(false, std::sync::atomic::Ordering::AcqRel);
        git_changed |= invalidated;
        if invalidated {
          paths.clear();
        }
        let git = app.try_state::<crate::git::GitState>();
        // Git metadata is omitted from the tree but still changes
        // cached branch/history/status queries, even for ignored paths.
        let _git_invalidation = git
          .as_ref()
          .filter(|_| git_changed)
          .map(|git| git.invalidation(&root));
        let single = workspace.root_info();
        let relative: Vec<String> = paths
          .iter()
          .filter_map(|path| {
            if single.kind == crate::workspace::RootKind::Single
              && path != &PathBuf::from(&single.path)
            {
              return None;
            }
            let relative = super::paths::display_relative(&root, path).ok()?;
            (!ignored(&relative)).then_some(relative)
          })
          .collect();
        if relative.is_empty() && !invalidated {
          continue;
        }
        workspace
          .watcher_busy
          .store(true, std::sync::atomic::Ordering::Release);
        let _busy = WatchBusy(&workspace.watcher_busy);
        let _mutation = workspace.mutation.lock().await;
        if workspace.ensure_active().is_err() {
          break;
        }
        if let Err(error) = workspace
          .refresh_changed_buffers(&relative, invalidated)
          .await
        {
          log::warn!("Workspace watcher refresh failed: {}", error);
        }
        let _ = workspace.invalidate(&app);
        for path in &relative {
          if let Ok(Some(status)) = workspace.buffer_status(path).await {
            let _ = workspace.emit_to_owners(
              &app,
              crate::desktop::event_contracts::FS_BUFFER_STATUS,
              status,
            );
          }
        }
      }
    });
    Ok(())
  }
}

struct WatchBusy<'a>(&'a std::sync::atomic::AtomicBool);
impl Drop for WatchBusy<'_> {
  fn drop(&mut self) {
    self.0.store(false, std::sync::atomic::Ordering::Release);
  }
}
fn ignored(relative: &str) -> bool {
  relative
    .split('/')
    .any(|part| matches!(part, ".git" | ".marklab") || part.starts_with(".tmp"))
}
fn changes_filesystem(event: &notify::Result<notify::Event>) -> bool {
  match event {
    Ok(event) => event.need_rescan() || !matches!(event.kind, notify::EventKind::Access(_)),
    Err(_) => true,
  }
}
fn collect(
  event: notify::Result<notify::Event>,
  root: &Path,
  paths: &mut BTreeSet<PathBuf>,
  invalidated: &mut bool,
) -> bool {
  // Keep Git metadata changes even when omitted from the workspace tree, but
  // never invalidate queries just because reading .git opened a file.
  let changed = changes_filesystem(&event);
  if *invalidated {
    paths.clear();
    return changed;
  }
  match event {
    // Rescan outranks Access: the native backend has lost its event history.
    Ok(event) if event.need_rescan() => {
      *invalidated = true;
    }
    Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) => {
      if event.paths.is_empty() {
        *invalidated = true;
      }
      for path in event.paths {
        // The root represents all descendants, not a valid empty buffer
        // key. An unidentifiable event likewise requires a full refresh.
        if path == root || !path.is_absolute() {
          *invalidated = true;
          break;
        }
        let Ok(relative) = super::paths::display_relative(root, &path) else {
          continue;
        };
        if ignored(&relative) {
          continue;
        }
        paths.insert(path);
        if paths.len() > MAX_BATCH_PATHS {
          *invalidated = true;
          break;
        }
      }
    }
    Ok(_) => {}
    Err(error) => {
      *invalidated = true;
      log::warn!("Filesystem watcher lost events: {}", error);
    }
  }
  if *invalidated {
    paths.clear();
  }
  changed
}
fn watch_error(error: notify::Error) -> BackendError {
  BackendError::new("WATCH_FAILED", error.to_string())
}

pub(super) async fn watch_directory(
  root: PathBuf,
  recursive: bool,
) -> BackendResult<(
  notify::RecommendedWatcher,
  tokio::sync::mpsc::Receiver<notify::Result<notify::Event>>,
  Arc<std::sync::atomic::AtomicBool>,
)> {
  let (sender, receiver) = tokio::sync::mpsc::channel(EVENT_QUEUE_CAPACITY);
  let overflow = Arc::new(std::sync::atomic::AtomicBool::new(false));
  let overrun = overflow.clone();
  let watcher = crate::blocking::run(move || {
    let mut watcher = notify::recommended_watcher(move |event| {
      if sender.try_send(event).is_err() {
        overrun.store(true, std::sync::atomic::Ordering::Release);
      }
    })
    .map_err(watch_error)?;
    watcher
      .watch(
        &root,
        if recursive {
          RecursiveMode::Recursive
        } else {
          RecursiveMode::NonRecursive
        },
      )
      .map_err(watch_error)?;
    Ok(watcher)
  })
  .await?;
  Ok((watcher, receiver, overflow))
}

#[cfg(test)]
#[path = "watcher_tests.rs"]
mod tests;
