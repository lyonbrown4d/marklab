//! Named payloads retain the existing event targets and make their wire shapes
//! part of the Rust-owned contract rather than independent renderer declarations.
use serde::Serialize;
use std::marker::PhantomData;
use tauri::{Emitter, EventTarget, Runtime};

pub(crate) struct EventName<T> {
  pub name: &'static str,
  marker: PhantomData<fn() -> T>,
}
impl<T> Copy for EventName<T> {}
impl<T> Clone for EventName<T> {
  fn clone(&self) -> Self {
    *self
  }
}
impl<T: Serialize> EventName<T> {
  pub fn emit_to<R: Runtime>(
    self,
    emitter: &tauri::AppHandle<R>,
    target: EventTarget,
    payload: &T,
  ) -> tauri::Result<()> {
    emitter.emit_to(target, self.name, payload)
  }
  pub fn emit<R: Runtime>(self, emitter: &tauri::AppHandle<R>, payload: &T) -> tauri::Result<()> {
    emitter.emit(self.name, payload)
  }
}

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemThemeChanged {
  pub color_mode: ColorMode,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ColorMode {
  Light,
  Dark,
}
impl From<tauri::Theme> for ColorMode {
  fn from(theme: tauri::Theme) -> Self {
    if theme == tauri::Theme::Dark {
      Self::Dark
    } else {
      Self::Light
    }
  }
}
#[derive(Clone, Serialize, specta::Type)]
pub(crate) struct SingleInstance {
  pub args: Vec<String>,
  pub cwd: String,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WindowFlushRequested {
  pub request_id: String,
}
#[derive(Clone, Serialize, specta::Type)]
pub(crate) struct WindowCloseError {
  pub message: String,
}
#[derive(Clone, Serialize, specta::Type)]
pub(crate) struct WorkspaceGenerationChanged {
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub generation: u64,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceInvalidated {
  pub kind: InvalidationKind,
  pub root: crate::workspace::RootInfo,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub generation: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub previous_revision: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub revision: u64,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum InvalidationKind {
  Invalidated,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "lowercase")]
#[allow(
  dead_code,
  reason = "Retained for shared incremental tree event payloads."
)]
pub(crate) enum WorkspaceTreeChange {
  Added {
    entry: crate::workspace::Entry,
  },
  Changed {
    path: String,
  },
  Removed {
    path: String,
  },
  Renamed {
    from: String,
    entry: crate::workspace::Entry,
  },
}
// Tree subscribers support incremental changes as well as full invalidation.
// Filesystem invalidation remains a separate payload with its stable wire shape.
#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub(crate) enum WorkspaceTreeDeltaEvent {
  Invalidated {
    root: crate::workspace::RootInfo,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    generation: u64,
    #[serde(rename = "previousRevision", with = "crate::ipc_number")]
    #[specta(type = u64)]
    previous_revision: u64,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    revision: u64,
  },
  #[allow(
    dead_code,
    reason = "Retained in the shared incremental tree wire protocol."
  )]
  Changes {
    root: crate::workspace::RootInfo,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    generation: u64,
    #[serde(rename = "previousRevision", with = "crate::ipc_number")]
    #[specta(type = u64)]
    previous_revision: u64,
    #[serde(with = "crate::ipc_number")]
    #[specta(type = u64)]
    revision: u64,
    changes: Vec<WorkspaceTreeChange>,
  },
}
impl From<WorkspaceInvalidated> for WorkspaceTreeDeltaEvent {
  fn from(value: WorkspaceInvalidated) -> Self {
    Self::Invalidated {
      root: value.root,
      generation: value.generation,
      previous_revision: value.previous_revision,
      revision: value.revision,
    }
  }
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SyncProgressEvent {
  pub request_id: String,
  pub progress: crate::sync::SyncProgress,
}

macro_rules! event_contracts {
  ($($constant:ident: $field:ident => $name:literal: $payload:ty),* $(,)?) => {
    $(pub(crate) const $constant: EventName<$payload> = EventName { name: $name, marker: PhantomData };)*
    #[cfg(feature = "ipc-codegen")]
    pub(crate) const EVENT_NAMES: &[&str] = &[$($name),*];
    #[cfg(feature = "ipc-codegen")]
    pub use DesktopEventWirePayloads as DesktopEventPayloads;
    #[cfg(feature = "ipc-codegen")]
    #[derive(Serialize, specta::Type)]
    pub struct DesktopEventWirePayloads {
      $(#[serde(rename = $name)] $field: $payload,)*
    }
  };
}
event_contracts! {
  AI_GENERATION: ai_generation => "ai-generation-event": crate::ai::GenerationEvent,
  AI_COMPLETION: ai_completion => "ai-completion-event": crate::ai::GenerationEvent,
  EXPORT_TASK: export_task => "export-task": crate::export::types::ExportTaskEvent,
  SYNC_PROGRESS: sync_progress => "sync-progress": SyncProgressEvent,
  UPDATES_EVENT: updates_event => "updates-event": crate::platform::updates::UpdateEvent,
  FS_CHANGED: fs_changed => "fs-changed": WorkspaceInvalidated,
  WORKSPACE_TREE_CHANGED: workspace_tree_changed => "workspace-tree-changed": WorkspaceTreeDeltaEvent,
  FS_BUFFER_STATUS: fs_buffer_status => "fs-buffer-status": crate::workspace::BufferStatus,
  WORKSPACE_GENERATION_CHANGED: workspace_generation_changed => "workspace-generation-changed": WorkspaceGenerationChanged,
  WORKSPACE_SESSION_SEED: workspace_session_seed => "workspace-session-seed": super::startup::SessionSeed,
  TERMINAL_OUTPUT: terminal_output => "terminal-output": crate::terminal::Output,
  TERMINAL_EXIT: terminal_exit => "terminal-exit": crate::terminal::Exit,
  WEB_TABS_STATE: web_tabs_state => "web-tabs-state": crate::web_tabs::types::Event,
  SYSTEM_THEME_CHANGED: system_theme_changed => "system-theme-changed": SystemThemeChanged,
  MENU_ACTION: menu_action => "menu-action": String,
  WINDOW_OPENING_PROGRESS: window_opening_progress => "window-opening-progress": super::startup::Progress,
  WINDOW_PRESENTED: window_presented => "window-presented": (),
  SINGLE_INSTANCE: single_instance => "single-instance": SingleInstance,
  WINDOW_FLUSH_REQUESTED: window_flush_requested => "window-flush-requested": WindowFlushRequested,
  WINDOW_CLOSE_ERROR: window_close_error => "window-close-error": WindowCloseError,
  DEEP_LINK: deep_link => "deep-link": super::launch::DeepLink,
  RECENT_WORKSPACES_CHANGED: recent_workspaces_changed => "recent-workspaces-changed": (),
}

#[cfg(test)]
#[path = "event_contract_tests.rs"]
mod tests;
