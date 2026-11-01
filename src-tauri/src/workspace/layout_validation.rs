use super::layout_types::*;
use crate::error::{BackendError, BackendResult};
use std::collections::HashSet;

pub(super) const MAX_LAYOUT_BYTES: usize = 512_000;

pub(super) fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_WORKSPACE_LAYOUT", message)
}

fn safe_id(value: &str) -> bool {
  !value.is_empty() && value.len() <= 256 && !value.chars().any(char::is_control)
}

fn finite_size(value: f64) -> bool {
  value.is_finite() && (0.0..=100_000.0).contains(&value)
}

/// Routes are application locations, never URLs or arbitrary filesystem targets.
/// Return a decoded document path only for routes that depend on a file.
pub(super) fn route_path(route: &str) -> BackendResult<Option<String>> {
  if route.is_empty()
    || route.len() > 8192
    || !route.starts_with('/')
    || route.starts_with("//")
    || route.contains('\\')
    || route.chars().any(char::is_control)
  {
    return Err(invalid("Expected a supported application-relative route"));
  }
  let pathname = route.split(['?', '#']).next().unwrap_or(route);
  if ["/", "/workspace/pages", "/workspace/graph"].contains(&pathname) {
    return Ok(None);
  }
  let path = ["/files/edit/", "/files/source/", "/files/preview/"]
    .iter()
    .find_map(|prefix| pathname.strip_prefix(prefix))
    .or_else(|| {
      let rest = pathname.strip_prefix("/_diff/")?;
      let (section, path) = rest.split_once('/')?;
      ["staged", "unstaged", "untracked", "conflicts"]
        .contains(&section)
        .then_some(path)
    })
    .ok_or_else(|| invalid("This application route cannot be persisted"))?;
  // Match React Router's fallback for literal percent filenames: malformed
  // percent encoding leaves the complete path unchanged rather than partially
  // decoding it. Decoded paths still pass the same workspace path policy.
  let bytes = path.as_bytes();
  let malformed = bytes.iter().enumerate().any(|(index, byte)| {
    *byte == b'%'
      && (bytes
        .get(index + 1)
        .is_none_or(|byte| !byte.is_ascii_hexdigit())
        || bytes
          .get(index + 2)
          .is_none_or(|byte| !byte.is_ascii_hexdigit()))
  });
  let path = if malformed {
    std::borrow::Cow::Borrowed(path)
  } else {
    percent_encoding::percent_decode_str(path)
      .decode_utf8()
      .unwrap_or(std::borrow::Cow::Borrowed(path))
  };
  if path.chars().any(char::is_control) {
    return Err(invalid("Document path contains control characters"));
  }
  super::paths::relative_path(&path)?;
  Ok(Some(path.into_owned()))
}

pub(super) fn validate(layout: &WorkspaceLayout) -> BackendResult<()> {
  if layout.panels.len() > 200
    || !finite_size(layout.grid.width)
    || !finite_size(layout.grid.height)
  {
    return Err(invalid("Layout dimensions or panel count exceed limits"));
  }
  for (id, panel) in &layout.panels {
    let tab = &panel.params.tab;
    if !safe_id(id)
      || panel.id != *id
      || tab.id != *id
      || tab.title.len() > 1024
      || panel.title != tab.title
    {
      return Err(invalid("Panel metadata is invalid or inconsistent"));
    }
    route_path(&tab.route)?;
  }
  let mut state = GraphValidation::default();
  walk(&layout.grid.root, 0, layout, &mut state)?;
  if state.panels.len() != layout.panels.len()
    || layout
      .active_group
      .as_ref()
      .is_some_and(|group| !state.groups.contains(group.as_str()))
  {
    return Err(invalid(
      "Layout contains unreferenced panels or an invalid active group",
    ));
  }
  if serde_json::to_vec(layout)
    .map_err(super::super::settings::json_error)?
    .len()
    > MAX_LAYOUT_BYTES
  {
    return Err(invalid("Layout exceeds the 512 KB limit"));
  }
  Ok(())
}

#[derive(Default)]
struct GraphValidation<'a> {
  nodes: usize,
  panels: HashSet<&'a str>,
  groups: HashSet<&'a str>,
}

fn walk<'a>(
  node: &'a WorkspaceLayoutNode,
  depth: usize,
  layout: &'a WorkspaceLayout,
  state: &mut GraphValidation<'a>,
) -> BackendResult<()> {
  state.nodes += 1;
  let size = match node {
    WorkspaceLayoutNode::Branch { size, .. } | WorkspaceLayoutNode::Leaf { size, .. } => size,
  };
  if depth > 16 || state.nodes > 128 || size.is_some_and(|size| !finite_size(size)) {
    return Err(invalid("Layout grid exceeds depth, size, or node limits"));
  }
  match node {
    WorkspaceLayoutNode::Branch { data, .. } => {
      if data.len() > 64 {
        return Err(invalid("Layout branch exceeds the group limit"));
      }
      for child in data {
        walk(child, depth + 1, layout, state)?;
      }
    }
    WorkspaceLayoutNode::Leaf { data, .. } => {
      if !safe_id(&data.id)
        || state.groups.len() >= 64
        || !state.groups.insert(&data.id)
        || data.views.is_empty()
        || !data.views.contains(&data.active_view)
      {
        return Err(invalid("Layout group is invalid or duplicated"));
      }
      for id in &data.views {
        if !layout.panels.contains_key(id) || !state.panels.insert(id) {
          return Err(invalid("Layout panel references are missing or duplicated"));
        }
      }
    }
  }
  Ok(())
}

/// Remove unavailable file views without throwing away unrelated saved groups.
pub(super) fn prune(layout: &mut WorkspaceLayout, keep: &HashSet<String>) {
  layout.panels.retain(|id, _| keep.contains(id));
  let mut groups = HashSet::new();
  fn prune_node(
    node: &mut WorkspaceLayoutNode,
    keep: &HashSet<String>,
    groups: &mut HashSet<String>,
  ) -> bool {
    match node {
      WorkspaceLayoutNode::Branch { data, .. } => {
        data.retain_mut(|child| prune_node(child, keep, groups));
        !data.is_empty()
      }
      WorkspaceLayoutNode::Leaf { data, .. } => {
        data.views.retain(|id| keep.contains(id));
        let Some(first) = data.views.first() else {
          return false;
        };
        if !data.views.contains(&data.active_view) {
          data.active_view = first.clone();
        }
        groups.insert(data.id.clone());
        true
      }
    }
  }
  if !prune_node(&mut layout.grid.root, keep, &mut groups) {
    layout.grid.root = WorkspaceLayoutNode::Branch {
      data: vec![],
      size: None,
    };
  }
  if layout
    .active_group
    .as_ref()
    .is_some_and(|id| !groups.contains(id))
  {
    layout.active_group = None;
  }
}
