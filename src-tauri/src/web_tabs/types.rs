use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[derive(Debug, PartialEq, Clone, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct Bounds {
  pub height: u32,
  pub width: u32,
  pub x: i32,
  pub y: i32,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Activate {
  pub bounds: Bounds,
  pub tab_id: String,
  pub url: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Id {
  pub tab_id: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Navigate {
  pub tab_id: String,
  pub url: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetBounds {
  pub bounds: Bounds,
  pub tab_id: String,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct Bindings {
  pub bindings: HashMap<String, Vec<String>>,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum TabStatus {
  #[allow(dead_code, reason = "Retained in the shared web tab wire protocol.")]
  Idle,
  Loading,
  Ready,
  Error,
  #[allow(dead_code, reason = "Retained in the shared web tab wire protocol.")]
  Crashed,
  Closed,
}
#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub enum ShortcutAction {
  #[serde(rename = "app.commandPalette")]
  CommandPalette,
  #[serde(rename = "app.settings")]
  Settings,
  #[serde(rename = "file.new")]
  NewFile,
  #[serde(rename = "file.openProject")]
  OpenProject,
  #[serde(rename = "file.openFile")]
  OpenFile,
  #[serde(rename = "tab.next")]
  NextTab,
  #[serde(rename = "tab.previous")]
  PreviousTab,
  #[serde(rename = "tab.close")]
  CloseTab,
  #[serde(rename = "view.wysiwyg")]
  Wysiwyg,
  #[serde(rename = "view.source")]
  Source,
  #[serde(rename = "view.toggleSource")]
  ToggleSource,
  #[serde(rename = "view.toggleSidebar")]
  ToggleSidebar,
  #[serde(rename = "view.toggleRightSidebar")]
  ToggleRightSidebar,
  #[serde(rename = "view.toggleTerminal")]
  ToggleTerminal,
  #[serde(rename = "view.toggleReadonly")]
  ToggleReadonly,
  #[serde(rename = "view.toggleStatusBar")]
  ToggleStatusBar,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
  pub active: bool,
  pub can_go_back: bool,
  pub can_go_forward: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<TabError>,
  pub status: TabStatus,
  pub tab_id: String,
  pub title: String,
  pub url: String,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct TabError {
  pub description: String,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum Event {
  State {
    state: TabState,
  },
  OpenRequested {
    #[serde(rename = "tabId")]
    tab_id: String,
    url: String,
  },
  Shortcut {
    action: ShortcutAction,
    #[serde(rename = "tabId")]
    tab_id: String,
  },
}
pub use WebTabsOkResult as OkResult;
#[derive(Serialize, specta::Type)]
pub struct WebTabsOkResult {
  pub ok: bool,
}
pub fn success() -> OkResult {
  OkResult { ok: true }
}
