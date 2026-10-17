use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[derive(Debug, PartialEq, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bounds {
    pub height: u32,
    pub width: u32,
    pub x: i32,
    pub y: i32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Activate {
    pub bounds: Bounds,
    pub tab_id: String,
    pub url: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Id {
    pub tab_id: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Navigate {
    pub tab_id: String,
    pub url: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetBounds {
    pub bounds: Bounds,
    pub tab_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Bindings {
    pub bindings: HashMap<String, Vec<String>>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TabState {
    pub active: bool,
    pub can_go_back: bool,
    pub can_go_forward: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<TabError>,
    pub status: String,
    pub tab_id: String,
    pub title: String,
    pub url: String,
}
#[derive(Clone, Serialize)]
pub struct TabError {
    pub description: String,
}
#[derive(Clone, Serialize)]
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
        action: String,
        #[serde(rename = "tabId")]
        tab_id: String,
    },
}
#[derive(Serialize)]
pub struct OkResult {
    pub ok: bool,
}
pub fn success() -> OkResult {
    OkResult { ok: true }
}
