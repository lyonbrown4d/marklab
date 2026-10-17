use super::{Workspace, WorkspaceRegistry, commands::MoveRequest};
use crate::error::{BackendError, BackendResult};
use crate::native_window::TrustedWindow as WebviewWindow;
use std::{path::Path, sync::Arc};
use tauri::Manager;

#[path = "references.rs"]
mod references;
#[cfg(test)]
#[path = "references_tests.rs"]
mod references_tests;

pub(super) async fn move_path(
    window: WebviewWindow,
    workspace: Arc<Workspace>,
    request: MoveRequest,
) -> BackendResult<()> {
    let _mutation = workspace.mutation.lock().await;
    window
        .state::<WorkspaceRegistry>()
        .ensure_binding(window.label(), &workspace)?;
    workspace
        .move_path_under_lock(&request.from, &request.to)
        .await?;
    workspace.clone().schedule_save(window.app_handle().clone());
    super::commands::announce(&window, &workspace).await
}
impl Workspace {
    pub async fn move_path(&self, from: &str, to: &str) -> BackendResult<()> {
        let _mutation = self.mutation.lock().await;
        self.move_path_under_lock(from, to).await
    }
    async fn move_path_under_lock(&self, from: &str, to: &str) -> BackendResult<()> {
        self.flush_buffers_under_lock().await?;
        let _commits = self.commit_gate.lock().await;
        let source = self.resolve_async(from).await?;
        let root = self.root_info();
        let destination = if root.kind == "single" {
            let directory = self.root_directory();
            let relative = to.to_owned();
            if super::paths::relative_path(&relative)?.components().count() != 1 {
                return Err(BackendError::new(
                    "INVALID_PATH",
                    "Single-file rename must remain in its current directory",
                ));
            }
            crate::blocking::run(move || super::paths::resolve(&directory, &relative)).await?
        } else {
            self.resolve_async(to).await?
        };
        // Parse before moving paths so resolution uses the old workspace. The
        // plan retains each source baseline for the existing save CAS.
        let rewrites = references::prepare(self, from, to).await?;
        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let target = destination.clone();
        crate::blocking::run(move || rename_exclusive(&source, &target)).await?;
        if root.kind == "single" {
            self.rename_single_root(destination);
        }
        let mut buffers = self.buffers.lock().await;
        let prefix = format!("{from}/");
        let paths: Vec<_> = buffers
            .keys()
            .filter(|path| path.as_str() == from || path.starts_with(&prefix))
            .cloned()
            .collect();
        for path in paths {
            if let Some(buffer) = buffers.remove(&path) {
                buffers.insert(format!("{to}{}", &path[from.len()..]), buffer);
            }
        }
        references::publish(&mut buffers, rewrites);
        self.next_revision();
        Ok(())
    }
}

// The destination check is part of the rename itself, so another process cannot
// create a file in the gap and have it silently overwritten.
fn rename_exclusive(from: &Path, to: &Path) -> BackendResult<()> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let from = std::ffi::CString::new(from.as_os_str().as_bytes())
            .map_err(|_| BackendError::new("INVALID_PATH", "Invalid source filename"))?;
        let to = std::ffi::CString::new(to.as_os_str().as_bytes())
            .map_err(|_| BackendError::new("INVALID_PATH", "Invalid destination filename"))?;
        // SAFETY: both strings are valid NUL-terminated paths owned through the call.
        #[cfg(target_os = "macos")]
        let result = unsafe { libc::renamex_np(from.as_ptr(), to.as_ptr(), libc::RENAME_EXCL) };
        #[cfg(target_os = "linux")]
        let result = unsafe {
            libc::renameat2(
                libc::AT_FDCWD,
                from.as_ptr(),
                libc::AT_FDCWD,
                to.as_ptr(),
                libc::RENAME_NOREPLACE,
            )
        };
        #[cfg(not(any(target_os = "linux", target_os = "macos")))]
        return Err(BackendError::new(
            "UNSUPPORTED_PLATFORM",
            "Exclusive rename is unavailable on this desktop platform",
        ));
        #[cfg(any(target_os = "linux", target_os = "macos"))]
        if result != 0 {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    #[cfg(windows)]
    std::fs::rename(from, to)?;
    Ok(())
}
