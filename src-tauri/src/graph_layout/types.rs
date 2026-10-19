use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphLayoutRequest {
  pub engine_version: String,
  pub graph_revision: String,
  pub layout_key: String,
  pub mode: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphLayoutNode {
  pub collapsed: bool,
  pub height: f64,
  pub id: String,
  pub pinned: bool,
  pub user_modified: bool,
  pub width: f64,
  pub x: f64,
  pub y: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GraphLayoutViewport {
  pub x: f64,
  pub y: f64,
  pub zoom: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphLayoutSave {
  pub engine_version: String,
  pub graph_revision: String,
  pub layout_key: String,
  pub mode: String,
  pub nodes: Vec<GraphLayoutNode>,
  pub viewport: Option<GraphLayoutViewport>,
}
#[derive(Debug, Serialize)]
pub struct GraphLayoutResult {
  pub r#match: &'static str,
  pub nodes: Vec<GraphLayoutNode>,
  pub viewport: Option<GraphLayoutViewport>,
}
impl GraphLayoutRequest {
  pub fn validate(&self) -> BackendResult<()> {
    validate_request(
      &self.engine_version,
      &self.graph_revision,
      &self.layout_key,
      &self.mode,
    )
  }
}
impl GraphLayoutSave {
  pub fn validate(&self) -> BackendResult<()> {
    validate_request(
      &self.engine_version,
      &self.graph_revision,
      &self.layout_key,
      &self.mode,
    )?;
    if self.nodes.len() > 5_000 {
      return Err(invalid("A layout supports at most 5000 nodes"));
    }
    let mut seen = std::collections::HashSet::new();
    for node in &self.nodes {
      if !bounded(&node.id, 1024)
        || !seen.insert(&node.id)
        || !dimension(node.width)
        || !dimension(node.height)
        || !coordinate(node.x)
        || !coordinate(node.y)
      {
        return Err(invalid("Invalid or duplicate layout node"));
      }
    }
    if let Some(viewport) = &self.viewport
      && (!coordinate(viewport.x)
        || !coordinate(viewport.y)
        || !viewport.zoom.is_finite()
        || !(0.1..=4.0).contains(&viewport.zoom))
    {
      return Err(invalid("Invalid graph viewport"));
    }
    Ok(())
  }
}
fn validate_request(engine: &str, revision: &str, key: &str, mode: &str) -> BackendResult<()> {
  if !bounded(engine, 128)
    || !bounded(revision, 512)
    || !bounded(key, 512)
    || !["focus", "overview"].contains(&mode)
  {
    return Err(invalid("Invalid graph layout request"));
  }
  Ok(())
}
fn bounded(value: &str, max: usize) -> bool {
  !value.trim().is_empty() && value.chars().count() <= max && !value.contains('\0')
}
fn coordinate(value: f64) -> bool {
  value.is_finite() && (-10_000_000.0..=10_000_000.0).contains(&value)
}
fn dimension(value: f64) -> bool {
  value.is_finite() && (24.0..=20_000.0).contains(&value)
}
fn invalid(message: &str) -> BackendError {
  BackendError::new("invalid_graph_layout", message)
}
