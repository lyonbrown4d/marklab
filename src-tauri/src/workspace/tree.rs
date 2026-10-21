use super::{EmptyRequest, RootInfo, WorkspaceRegistry};
use crate::error::{BackendError, BackendResult};
use crate::native_window::TrustedWindow as WebviewWindow;
use tauri::State;

#[path = "tree_types.rs"]
mod types;
pub use types::*;

#[tauri::command]
#[specta::specta]
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
      e.kind == crate::workspace::EntryKind::File
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
#[specta::specta]
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
  let entries = if workspace.root_info().kind == crate::workspace::RootKind::Single {
    if !parent.is_empty() {
      return Err(BackendError::new(
        "INVALID_PATH",
        "Single-file workspace has no child directories",
      ));
    }
    let file = std::path::PathBuf::from(workspace.root_info().path);
    vec![TreeEntry {
      kind: crate::workspace::EntryKind::File,
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
            crate::workspace::EntryKind::Folder
          } else {
            crate::workspace::EntryKind::File
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
        (
          a.kind != crate::workspace::EntryKind::Folder,
          a.name.to_lowercase(),
        )
          .cmp(&(
            b.kind != crate::workspace::EntryKind::Folder,
            b.name.to_lowercase(),
          ))
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
#[specta::specta]
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
#[specta::specta]
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
          has_children: e.kind == crate::workspace::EntryKind::Folder,
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
