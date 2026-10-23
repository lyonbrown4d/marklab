use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

pub const WORKSPACE: &str = "marklab.workspace";
pub const LAST_WORKSPACE: &str = "marklab.last-workspace-session";
pub const WORKSPACE_WINDOWS: &str = "marklab.workspace-window-sessions";
pub const REMOVED_WORKSPACES: &str = "marklab.removed-workspace-history";

#[derive(Clone, Debug, Default, Serialize, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct PersistedValue {
  #[serde(default)]
  #[specta(type = std::collections::BTreeMap<String, crate::ipc_json::JsonValue>)]
  pub state: Map<String, Value>,
  #[serde(
    default,
    with = "crate::ipc_number",
    skip_serializing_if = "Option::is_none"
  )]
  #[specta(type = Option<i64>)]
  pub version: Option<i64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WindowState {
  pub width: u32,
  pub height: u32,
  #[serde(default)]
  pub is_maximized: bool,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub x: Option<i32>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub y: Option<i32>,
}
#[derive(Serialize, specta::Type)]
pub struct PersistResult {
  pub ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub error: Option<String>,
}
impl PersistResult {
  pub fn from_result(result: BackendResult<()>) -> Self {
    match result {
      Ok(()) => Self {
        ok: true,
        error: None,
      },
      Err(error) => Self {
        ok: false,
        error: Some(error.to_string()),
      },
    }
  }
}
#[derive(Serialize, specta::Type)]
pub struct RecentWorkspace {
  pub path: String,
  pub status: RecentWorkspaceStatus,
}

pub fn allowed_keys(key: &str) -> BackendResult<&'static [&'static str]> {
  match key {
    WORKSPACE => Ok(&["activeTabId", "rootKind", "rootPath", "tabs"]),
    "marklab.drawio" => Ok(&["drawioEditorMode", "drawioEmbedUrl"]),
    "marklab.preferences" => Ok(&[
      "autoSystemThemeSync",
      "aiCompletionCloudContextConsent",
      "aiCompletionEnabled",
      "aiCompletionLength",
      "aiCompletionNearbyContextEnabled",
      "aiCompletionProviderId",
      "aiCompletionTriggerMode",
      "documentCompletionEnabled",
      "desktopNotificationExportsEnabled",
      "desktopNotificationsBackgroundOnly",
      "desktopNotificationsEnabled",
      "desktopNotificationSyncEnabled",
      "desktopNotificationUpdatesEnabled",
      "aiDefaultProviderId",
      "customThemeId",
      "defaultFileView",
      "editorReadOnlyMode",
      "graphContentMode",
      "graphMiniMapEnabled",
      "graphMiniMapPosition",
      "graphMiniMapSize",
      "hideMarkdownDefaultAppPrompt",
      "immersiveFocusIntensity",
      "immersiveFocusMode",
      "immersiveFocusScope",
      "immersiveTypewriterMode",
      "immersiveZenMode",
      "locale",
      "markdownAssetImportStrategy",
      "markdownContentWidth",
      "motionAnimatedCursor",
      "motionAnimatedPanels",
      "motionSmoothScrolling",
      "rightSidebarCollapsed",
      "shortcutOverrides",
      "showEditorStatusBar",
      "sidebarCollapsed",
      "silentSave",
      "sourceCodeMiniMapEnabled",
      "vimModeEnabled",
      "terminalShellPath",
      "theme",
      "themeMode",
      "lightTheme",
      "darkTheme",
    ]),
    _ => Err(BackendError::new(
      "invalid_settings_key",
      "Unsupported settings persist key",
    )),
  }
}
pub fn normalize_workspace(value: &mut PersistedValue) {
  value
    .state
    .retain(|key, _| ["activeTabId", "rootKind", "rootPath", "tabs"].contains(&key.as_str()));
  let kind = value
    .state
    .get("rootKind")
    .and_then(Value::as_str)
    .filter(|kind| ["external", "single"].contains(kind))
    .unwrap_or("internal");
  value
    .state
    .insert("rootKind".into(), Value::String(kind.into()));
  let tabs = value
    .state
    .get("tabs")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default();
  let mut seen = std::collections::HashSet::new();
  let valid_tabs = tabs
    .into_iter()
    .filter(|tab| {
      let string = |key: &str| {
        tab
          .get(key)
          .and_then(Value::as_str)
          .filter(|value| !value.is_empty())
      };
      let id = match string("kind") {
        Some("file") => {
          string("path").map(|path| format!("file:{}:{path}", string("view").unwrap_or("edit")))
        }
        Some("git-diff") => string("path").map(|path| {
          format!(
            "git-diff:{}:{path}",
            string("section").unwrap_or("unstaged")
          )
        }),
        Some("web") => string("id").map(|id| format!("web:{id}")),
        _ => None,
      };
      id.is_some_and(|id| seen.insert(id))
    })
    .collect();
  value.state.insert("tabs".into(), Value::Array(valid_tabs));
}
pub fn root_path(value: &PersistedValue) -> Option<&str> {
  value
    .state
    .get("rootPath")
    .and_then(Value::as_str)
    .filter(|path| !path.is_empty())
}

#[derive(Clone, Copy, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum RecentWorkspaceStatus {
  Available,
  Missing,
  Unavailable,
}
