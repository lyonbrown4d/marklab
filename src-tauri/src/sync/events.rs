use crate::desktop::event_contracts::{
  FS_CHANGED, InvalidationKind, WORKSPACE_TREE_CHANGED, WorkspaceInvalidated,
};
use crate::native_window::TrustedWindow as WebviewWindow;
use tauri::Manager;

pub(super) async fn announce_changes(
  window: &WebviewWindow,
  workspace: &crate::workspace::Workspace,
  previous: u64,
) {
  let revision = workspace.current_revision();
  if revision == previous || workspace.ensure_active().is_err() {
    return;
  }
  let payload = WorkspaceInvalidated {
    kind: InvalidationKind::Invalidated,
    root: workspace.root_info(),
    generation: workspace.generation,
    previous_revision: previous,
    revision,
  };
  let _ = workspace.emit_to_owners(window.app_handle(), FS_CHANGED, payload.clone());
  let _ = workspace.emit_to_owners(window.app_handle(), WORKSPACE_TREE_CHANGED, payload.into());
}
