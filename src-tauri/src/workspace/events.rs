use super::{Workspace, WorkspaceRegistry};
use crate::error::BackendResult;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

impl Workspace {
    pub fn emit_to_owners<R: Runtime, T: Serialize + Clone>(
        &self,
        app: &AppHandle<R>,
        event: &str,
        payload: T,
    ) -> BackendResult<()> {
        let registry = app.state::<WorkspaceRegistry>();
        for owner in registry.owners(self.generation)? {
            app.emit_to(
                tauri::EventTarget::webview_window(owner),
                event,
                payload.clone(),
            )?;
        }
        Ok(())
    }

    pub fn invalidate(&self, app: &AppHandle) -> BackendResult<()> {
        if let Some(git) = app.try_state::<crate::git::GitState>() {
            git.invalidate_root(&self.root_directory());
        }
        let previous = self.current_revision();
        let revision = self.next_revision();
        let payload = serde_json::json!({"kind":"invalidated","root":self.root_info(),"generation":self.generation,"previousRevision":previous,"revision":revision});
        self.emit_to_owners(app, "fs-changed", &payload)?;
        self.emit_to_owners(app, "workspace-tree-changed", &payload)
    }
}

#[cfg(test)]
#[path = "event_tests.rs"]
mod tests;
