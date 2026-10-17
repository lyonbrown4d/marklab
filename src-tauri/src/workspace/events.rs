use super::{Workspace, WorkspaceRegistry};
use crate::error::BackendResult;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

impl Workspace {
    pub fn emit<T: Serialize + Clone>(
        &self,
        app: &AppHandle,
        event: &str,
        payload: T,
    ) -> BackendResult<()> {
        let registry = app.state::<WorkspaceRegistry>();
        for owner in registry.owners(self.generation)? {
            if let Some(window) = crate::native_window::get(app, &owner) {
                window.emit(event, payload.clone())?;
            }
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
        self.emit(app, "fs-changed", &payload)?;
        self.emit(app, "workspace-tree-changed", &payload)
    }
}
