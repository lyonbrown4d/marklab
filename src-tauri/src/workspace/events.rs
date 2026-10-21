use super::{Workspace, WorkspaceRegistry};
use crate::{
  desktop::event_contracts::{
    EventName, FS_CHANGED, InvalidationKind, WORKSPACE_TREE_CHANGED, WorkspaceInvalidated,
  },
  error::BackendResult,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

impl Workspace {
  pub(crate) fn emit_to_owners<R: Runtime, T: Serialize>(
    &self,
    app: &AppHandle<R>,
    event: EventName<T>,
    payload: T,
  ) -> BackendResult<()> {
    let registry = app.state::<WorkspaceRegistry>();
    for owner in registry.owners(self.generation)? {
      event.emit_to(app, tauri::EventTarget::webview_window(owner), &payload)?;
    }
    Ok(())
  }

  pub fn invalidate(&self, app: &AppHandle) -> BackendResult<()> {
    if let Some(git) = app.try_state::<crate::git::GitState>() {
      git.invalidate_root(&self.root_directory());
    }
    let previous = self.current_revision();
    let revision = self.next_revision();
    let payload = WorkspaceInvalidated {
      kind: InvalidationKind::Invalidated,
      root: self.root_info(),
      generation: self.generation,
      previous_revision: previous,
      revision,
    };
    self.emit_to_owners(app, FS_CHANGED, payload.clone())?;
    self.emit_to_owners(app, WORKSPACE_TREE_CHANGED, payload.into())
  }
}

#[cfg(test)]
#[path = "event_tests.rs"]
mod tests;
