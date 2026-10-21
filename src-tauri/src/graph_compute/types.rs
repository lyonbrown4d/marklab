use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

pub const ENGINE_VERSION: &str = "native-workspace-map-v1";

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum GraphLayoutMode {
  Overview,
  Focus,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphLayoutComputeNode {
  pub id: String,
  pub width: f64,
  pub height: f64,
  #[serde(default)]
  pub group: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq, PartialOrd, Ord, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphLayoutComputeEdge {
  pub source: String,
  pub target: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GraphLayoutComputeRequest {
  pub request_id: String,
  pub mode: GraphLayoutMode,
  pub nodes: Vec<GraphLayoutComputeNode>,
  pub edges: Vec<GraphLayoutComputeEdge>,
}

#[derive(Clone, Debug, Serialize, PartialEq, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphLayoutPosition {
  pub id: String,
  pub x: f64,
  pub y: f64,
}

#[derive(Clone, Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphLayoutComputeResult {
  pub positions: Vec<GraphLayoutPosition>,
  pub engine_version: &'static str,
}

pub(super) fn invalid(message: &str) -> BackendError {
  BackendError::new("invalid_graph_layout", message)
}

pub(super) fn valid_text(value: &str) -> bool {
  !value.trim().is_empty() && value.chars().count() <= 1024 && !value.contains('\0')
}

impl GraphLayoutComputeRequest {
  pub(super) fn normalize(&mut self) -> BackendResult<()> {
    if !valid_text(&self.request_id) {
      return Err(invalid("Invalid graph request ID"));
    }
    let mut ids = BTreeSet::new();
    for node in &self.nodes {
      if !valid_text(&node.id)
        || !ids.insert(node.id.as_str())
        || ![node.width, node.height]
          .into_iter()
          .all(|size| size.is_finite() && (24.0..=20_000.0).contains(&size))
        || node
          .group
          .as_deref()
          .is_some_and(|group| !valid_text(group))
      {
        return Err(invalid("Invalid, duplicate, or oversized graph node"));
      }
    }
    if self
      .edges
      .iter()
      .any(|edge| !ids.contains(edge.source.as_str()) || !ids.contains(edge.target.as_str()))
    {
      return Err(invalid("Graph edge references an unknown node"));
    }
    self.nodes.sort_by(|a, b| a.id.cmp(&b.id));
    self.edges.sort();
    self.edges.dedup();
    Ok(())
  }
}
