use super::{EmptyRequest, RootInfo, WorkspaceRegistry};
use crate::error::{BackendError, BackendResult};
use crate::native_window::TrustedWindow as WebviewWindow;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeEntry {
  kind: String,
  name: String,
  path: String,
  has_children: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChildrenRequest {
  cursor: Option<String>,
  limit: Option<usize>,
  parent: Option<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChildrenResult {
  entries: Vec<TreeEntry>,
  next_cursor: Option<String>,
  parent: String,
  generation: u64,
  revision: u64,
  root: RootInfo,
}
#[derive(Serialize)]
pub struct InitialResult {
  generation: u64,
  path: Option<String>,
  revision: u64,
  root: RootInfo,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ExistenceRequest {
  kind: Option<String>,
  paths: Vec<String>,
}
#[derive(Serialize)]
pub struct ExistenceResult {
  existing: Vec<String>,
  generation: u64,
  revision: u64,
  root: RootInfo,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchRequest {
  query: String,
  limit: Option<usize>,
}
#[derive(Serialize)]
pub struct SearchResult {
  entries: Vec<TreeEntry>,
  generation: u64,
  revision: u64,
  root: RootInfo,
}

#[tauri::command]
pub async fn workspace_tree_initial_file(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  request: EmptyRequest,
) -> BackendResult<InitialResult> {
  let _ = request;
  let workspace = registry.get(window.label())?;
  let snapshot = workspace.snapshot().await?;
  let files: Vec<_> = snapshot
    .entries
    .iter()
    .filter(|e| {
      e.kind == "file"
        && matches!(
          std::path::Path::new(&e.path)
            .extension()
            .and_then(|v| v.to_str()),
          Some("md" | "markdown")
        )
    })
    .collect();
  let first = files
    .iter()
    .find(|e| e.path.eq_ignore_ascii_case("readme.md"))
    .or_else(|| files.first())
    .map(|e| e.path.clone());
  Ok(InitialResult {
    generation: workspace.generation,
    path: first,
    revision: workspace.current_revision(),
    root: workspace.root_info(),
  })
}

#[tauri::command]
pub async fn workspace_tree_list_children(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  request: ChildrenRequest,
) -> BackendResult<ChildrenResult> {
  let workspace = registry.get(window.label())?;
  let parent = request.parent.unwrap_or_default();
  let limit = request.limit.unwrap_or(100);
  if limit == 0 || limit > 256 {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid tree page size",
    ));
  }
  let revision = workspace.current_revision();
  let root = workspace.root_directory();
  let target = if parent.is_empty() {
    root.clone()
  } else {
    workspace.resolve_async(&parent).await?
  };
  let entries = if workspace.root_info().kind == "single" {
    if !parent.is_empty() {
      return Err(BackendError::new(
        "INVALID_PATH",
        "Single-file workspace has no child directories",
      ));
    }
    let file = std::path::PathBuf::from(workspace.root_info().path);
    vec![TreeEntry {
      kind: "file".into(),
      name: file
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default(),
      path: file
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default(),
      has_children: false,
    }]
  } else {
    crate::blocking::run(move || -> BackendResult<Vec<TreeEntry>> {
      let mut entries = Vec::new();
      for entry in std::fs::read_dir(target)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if matches!(name.as_str(), ".git" | ".marklab") || kind.is_symlink() {
          continue;
        }
        entries.push(TreeEntry {
          kind: if kind.is_dir() {
            "folder".into()
          } else {
            "file".into()
          },
          name,
          path: super::paths::display_relative(&root, &entry.path())?,
          has_children: kind.is_dir()
            && std::fs::read_dir(entry.path())
              .map(|mut i| i.next().is_some())
              .unwrap_or(false),
        });
      }
      if entries.len() > 100_000 {
        return Err(BackendError::new(
          "WORKSPACE_TOO_LARGE",
          "Directory exceeds supported entry limit",
        ));
      }
      entries.sort_by(|a, b| {
        (a.kind != "folder", a.name.to_lowercase())
          .cmp(&(b.kind != "folder", b.name.to_lowercase()))
      });
      Ok(entries)
    })
    .await?
  };
  workspace.ensure_active()?;
  if workspace.current_revision() != revision {
    return Err(BackendError::new(
      "STALE_TREE",
      "Tree changed while listing children",
    ));
  }
  let parent_key = super::paths::fingerprint(&parent);
  let offset = if let Some(cursor) = request.cursor {
    let expected = format!("{}:{revision}:{parent_key}:", workspace.generation);
    cursor
      .strip_prefix(&expected)
      .and_then(|n| n.parse::<usize>().ok())
      .ok_or_else(|| BackendError::new("STALE_TREE", "Tree changed while loading a page"))?
  } else {
    0
  };
  let total = entries.len();
  let entries = entries.into_iter().skip(offset).take(limit).collect();
  Ok(ChildrenResult {
    entries,
    next_cursor: (offset + limit < total).then(|| {
      format!(
        "{}:{revision}:{parent_key}:{}",
        workspace.generation,
        offset + limit
      )
    }),
    parent,
    generation: workspace.generation,
    revision,
    root: workspace.root_info(),
  })
}

#[tauri::command]
pub async fn workspace_tree_paths_exist(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  request: ExistenceRequest,
) -> BackendResult<ExistenceResult> {
  if request
    .kind
    .as_deref()
    .is_some_and(|kind| !matches!(kind, "any" | "file"))
  {
    return Err(BackendError::new("INVALID_REQUEST", "Invalid entry kind"));
  }
  if request.paths.len() > 256 {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Too many existence paths",
    ));
  }
  let workspace = registry.get(window.label())?;
  let mut existing = Vec::new();
  for path in request.paths {
    let target = workspace.resolve_async(&path).await?;
    if let Ok(m) = tokio::fs::metadata(target).await
      && (request.kind.as_deref() != Some("file") || m.is_file())
    {
      existing.push(path);
    }
  }
  Ok(ExistenceResult {
    existing,
    generation: workspace.generation,
    revision: workspace.current_revision(),
    root: workspace.root_info(),
  })
}

#[tauri::command]
pub async fn workspace_tree_search(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  request: SearchRequest,
) -> BackendResult<SearchResult> {
  let workspace = registry.get(window.label())?;
  let limit = request.limit.unwrap_or(50);
  if limit == 0 || limit > 100 || request.query.len() > 256 {
    return Err(BackendError::new("INVALID_REQUEST", "Invalid tree query"));
  }
  let snapshot = workspace.snapshot().await?;
  let entries = crate::blocking::run(move || {
    let query = request.query.to_lowercase();
    Ok(
      snapshot
        .entries
        .into_iter()
        .filter(|e| e.path.to_lowercase().contains(&query))
        .take(limit)
        .map(|e| TreeEntry {
          has_children: e.kind == "folder",
          kind: e.kind,
          name: e.name,
          path: e.path,
        })
        .collect(),
    )
  })
  .await?;
  Ok(SearchResult {
    entries,
    generation: workspace.generation,
    revision: workspace.current_revision(),
    root: workspace.root_info(),
  })
}
