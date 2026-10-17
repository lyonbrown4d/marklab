use super::Workspace;
use crate::error::{BackendError, BackendResult};
use notify::{RecursiveMode, Watcher};
use std::{collections::BTreeSet, path::PathBuf, sync::Arc, time::Duration};
use tauri::Manager;

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
        let (watcher, mut receiver, overflow) =
            watch_directory(root, self.root_info().kind != "single").await?;
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
                collect(first, &mut paths, &mut invalidated);
                tokio::time::sleep(Duration::from_millis(120)).await;
                while let Ok(event) = receiver.try_recv() {
                    collect(event, &mut paths, &mut invalidated);
                }
                invalidated |= overflow.swap(false, std::sync::atomic::Ordering::AcqRel);
                let root = workspace.root_directory();
                let git = app.try_state::<crate::git::GitState>();
                // Git metadata is omitted from the tree but still changes
                // cached branch/history/status queries, even for ignored paths.
                let _git_invalidation = git.as_ref().map(|git| git.invalidation(&root));
                let single = workspace.root_info();
                let relative: Vec<String> = paths
                    .iter()
                    .filter_map(|path| {
                        if single.kind == "single" && path != &PathBuf::from(&single.path) {
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
                        let _ = workspace.emit(&app, "fs-buffer-status", status);
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
fn collect(
    event: notify::Result<notify::Event>,
    paths: &mut BTreeSet<PathBuf>,
    invalidated: &mut bool,
) {
    match event {
        Ok(event) if !matches!(event.kind, notify::EventKind::Access(_)) => {
            paths.extend(event.paths);
        }
        Ok(_) => {}
        Err(error) => {
            *invalidated = true;
            log::warn!("Filesystem watcher lost events: {}", error);
        }
    }
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
    let (sender, receiver) = tokio::sync::mpsc::channel(256);
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
