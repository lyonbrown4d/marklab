use super::Workspace;
use std::{
    sync::{Arc, atomic::Ordering},
    time::Duration,
};

impl Workspace {
    // One debounced worker per shared workspace. Never abort a running atomic
    // save: the mutation guard must outlive every filesystem commit.
    pub fn schedule_save(self: Arc<Self>, app: tauri::AppHandle) {
        self.save_request.fetch_add(1, Ordering::AcqRel);
        if self.autosave_running.swap(true, Ordering::AcqRel) {
            return;
        }
        let weak = Arc::downgrade(&self);
        tauri::async_runtime::spawn(async move {
            let mut delay = Duration::from_millis(700);
            loop {
                let Some(workspace) = weak.upgrade() else {
                    break;
                };
                let requested = workspace.save_request.load(Ordering::Acquire);
                drop(workspace);
                tokio::time::sleep(delay).await;
                let Some(workspace) = weak.upgrade() else {
                    break;
                };
                if workspace.ensure_active().is_err() {
                    break;
                }
                if requested != workspace.save_request.load(Ordering::Acquire) {
                    continue;
                }
                let result = workspace.flush_buffers().await;
                let statuses: Vec<_> = workspace
                    .buffers
                    .lock()
                    .await
                    .iter()
                    .map(|(path, buffer)| super::BufferStatus {
                        path: path.clone(),
                        revision: buffer.revision,
                        dirty: buffer.dirty,
                        session_generation: workspace.generation,
                    })
                    .collect();
                for status in statuses {
                    let _ = workspace.emit_to_owners(&app, "fs-buffer-status", status);
                }
                match result {
                    Ok(count) => {
                        if count > 0 {
                            let _ = workspace.invalidate(&app);
                        }
                        delay = Duration::from_millis(700);
                    }
                    Err(error)
                        if error.code != "FILE_CONFLICT" && error.code != "STALE_SESSION" =>
                    {
                        // Retry transient disk failures without losing the dirty buffer.
                        delay = Duration::from_millis(1500);
                        continue;
                    }
                    Err(_) => {}
                }
                workspace.autosave_running.store(false, Ordering::Release);
                // An edit can land between the final check and releasing the
                // running flag. Reclaim this worker only if nobody else did.
                if requested != workspace.save_request.load(Ordering::Acquire)
                    && workspace
                        .autosave_running
                        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                        .is_ok()
                {
                    continue;
                }
                break;
            }
        });
    }
}
