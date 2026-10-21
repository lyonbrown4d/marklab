use super::save_paths::SavePathGrants;
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  error::{BackendError, BackendResult},
  workspace::types::EmptyRequest,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

#[derive(Default, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DialogRequest {
  #[serde(default)]
  title: Option<String>,
  #[serde(default)]
  default_path: Option<String>,
  #[serde(default)]
  button_label: Option<String>,
  #[serde(default)]
  filters: Option<Vec<Filter>>,
  #[serde(default)]
  multiple: Option<bool>,
  #[serde(default)]
  directory: Option<bool>,
  #[serde(default)]
  file: Option<bool>,
}
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
struct Filter {
  name: String,
  extensions: Vec<String>,
}
#[derive(Serialize, specta::Type)]
#[serde(untagged)]
pub enum Selection {
  Single(String),
  Multiple(Vec<String>),
}

fn builder(
  window: &WebviewWindow,
  request: &DialogRequest,
) -> BackendResult<FileDialogBuilder<tauri::Wry>> {
  let mut builder = window
    .app_handle()
    .dialog()
    .file()
    .set_parent(window.as_ref());
  if let Some(title) = &request.title {
    builder = builder.set_title(title);
  }
  if let Some(path) = &request.default_path {
    let path = PathBuf::from(path);
    if path.is_file() {
      if let Some(parent) = path.parent() {
        builder = builder.set_directory(parent);
      }
      if let Some(name) = path.file_name() {
        builder = builder.set_file_name(name.to_string_lossy());
      }
    } else if path.is_dir() {
      builder = builder.set_directory(path);
    } else {
      if let Some(parent) = path.parent().filter(|p| p.is_dir()) {
        builder = builder.set_directory(parent);
      }
      if let Some(name) = path.file_name() {
        builder = builder.set_file_name(name.to_string_lossy());
      }
    }
  }
  if let Some(filters) = &request.filters {
    if filters.len() > 32 {
      return Err(BackendError::new(
        "INVALID_REQUEST",
        "Too many file filters",
      ));
    }
    for filter in filters {
      if filter
        .extensions
        .iter()
        .any(|e| e.len() > 32 || !e.chars().all(|c| c.is_ascii_alphanumeric() || c == '*'))
      {
        return Err(BackendError::new("INVALID_REQUEST", "Invalid file filter"));
      }
      let extensions: Vec<_> = filter.extensions.iter().map(String::as_str).collect();
      builder = builder.add_filter(&filter.name, &extensions);
    }
  }
  let _ = &request.button_label;
  let _ = request.file;
  Ok(builder)
}

#[tauri::command]
#[specta::specta]
pub async fn dialog_open(
  window: WebviewWindow,
  request: DialogRequest,
) -> BackendResult<Option<Selection>> {
  tauri::async_runtime::spawn_blocking(move || {
    let builder = builder(&window, &request)?;
    let paths = match (
      request.directory.unwrap_or(false),
      request.multiple.unwrap_or(false),
    ) {
      (true, true) => builder.blocking_pick_folders(),
      (true, false) => builder.blocking_pick_folder().map(|p| vec![p]),
      (false, true) => builder.blocking_pick_files(),
      (false, false) => builder.blocking_pick_file().map(|p| vec![p]),
    };
    let Some(paths) = paths else { return Ok(None) };
    let values = paths
      .into_iter()
      .map(|p| {
        p.into_path()
          .map(|p| p.to_string_lossy().into_owned())
          .map_err(|e| BackendError::new("INVALID_PATH", e.to_string()))
      })
      .collect::<BackendResult<Vec<_>>>()?;
    Ok(if request.multiple.unwrap_or(false) {
      Some(Selection::Multiple(values))
    } else {
      values.into_iter().next().map(Selection::Single)
    })
  })
  .await
  .map_err(|e| BackendError::new("DIALOG_FAILED", e.to_string()))?
}

#[tauri::command]
#[specta::specta]
pub async fn dialog_save(
  window: WebviewWindow,
  request: DialogRequest,
) -> BackendResult<Option<String>> {
  tauri::async_runtime::spawn_blocking(move || {
    let selected = builder(&window, &request)?.blocking_save_file();
    let Some(path) = selected else {
      return Ok(None);
    };
    let path = path
      .into_path()
      .map_err(|e| BackendError::new("INVALID_PATH", e.to_string()))?;
    window
      .state::<SavePathGrants>()
      .issue(window.label(), &path)?;
    Ok(Some(path.to_string_lossy().into_owned()))
  })
  .await
  .map_err(|e| BackendError::new("DIALOG_FAILED", e.to_string()))?
}

#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct CreateWorkspaceRequest {
  name: String,
  #[serde(default)]
  title: Option<String>,
}
#[tauri::command]
#[specta::specta]
pub async fn dialog_create_workspace(
  window: WebviewWindow,
  request: CreateWorkspaceRequest,
) -> BackendResult<Option<String>> {
  if request.name.trim().is_empty()
    || request.name.len() > 128
    || request
      .name
      .chars()
      .any(|c| c == '/' || c == '\\' || c == '\0')
    || matches!(request.name.as_str(), "." | "..")
  {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid workspace name",
    ));
  }
  tauri::async_runtime::spawn_blocking(move || {
    let mut dialog = window
      .app_handle()
      .dialog()
      .file()
      .set_parent(window.as_ref());
    if let Some(title) = request.title {
      dialog = dialog.set_title(title);
    }
    let Some(parent) = dialog.blocking_pick_folder() else {
      return Ok(None);
    };
    let target = parent
      .into_path()
      .map_err(|e| BackendError::new("INVALID_PATH", e.to_string()))?
      .join(request.name);
    std::fs::create_dir(&target)?;
    Ok(Some(target.to_string_lossy().into_owned()))
  })
  .await
  .map_err(|e| BackendError::new("DIALOG_FAILED", e.to_string()))?
}

#[tauri::command]
#[specta::specta]
pub fn app_get_platform(request: EmptyRequest) -> BackendResult<PlatformInfo> {
  let _ = request;
  Ok(PlatformInfo {
    platform: if cfg!(target_os = "macos") {
      "macos"
    } else if cfg!(target_os = "windows") {
      "windows"
    } else {
      "linux"
    },
  })
}
#[derive(Serialize, specta::Type)]
pub struct PlatformInfo {
  platform: &'static str,
}
