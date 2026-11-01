use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceLayout {
  pub grid: WorkspaceLayoutGrid,
  pub panels: BTreeMap<String, WorkspaceLayoutPanel>,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub active_group: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceLayoutGrid {
  pub root: WorkspaceLayoutNode,
  pub width: f64,
  pub height: f64,
  pub orientation: WorkspaceLayoutOrientation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "UPPERCASE")]
pub enum WorkspaceLayoutOrientation {
  Horizontal,
  Vertical,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "type", rename_all = "lowercase", deny_unknown_fields)]
pub enum WorkspaceLayoutNode {
  Branch {
    data: Vec<WorkspaceLayoutNode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    size: Option<f64>,
  },
  Leaf {
    data: WorkspaceLayoutGroup,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    size: Option<f64>,
  },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceLayoutGroup {
  pub id: String,
  pub views: Vec<String>,
  pub active_view: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WorkspaceLayoutPanel {
  pub id: String,
  pub content_component: WorkspaceLayoutComponent,
  pub title: String,
  pub params: WorkspaceLayoutParams,
  pub renderer: WorkspaceLayoutRenderer,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub enum WorkspaceLayoutComponent {
  #[serde(rename = "workspace")]
  Workspace,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
pub enum WorkspaceLayoutRenderer {
  #[serde(rename = "onlyWhenVisible")]
  OnlyWhenVisible,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceLayoutParams {
  pub tab: WorkspaceLayoutTab,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceLayoutTab {
  pub id: String,
  pub route: String,
  pub title: String,
  pub kind: WorkspaceLayoutTabKind,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceLayoutTabKind {
  Graph,
  Document,
  Other,
}

#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceLayoutRequest {
  pub workspace_key: String,
}

#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct SetWorkspaceLayoutRequest {
  pub workspace_key: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub session_generation: u64,
  pub layout: WorkspaceLayout,
}

#[derive(Serialize, specta::Type)]
pub struct WorkspaceLayoutResult {
  pub layout: Option<WorkspaceLayout>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub session_generation: u64,
}

#[derive(Debug, Serialize, specta::Type)]
pub struct WorkspaceLayoutSaved {
  pub saved: bool,
}
