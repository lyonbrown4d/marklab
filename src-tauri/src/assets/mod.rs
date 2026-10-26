use crate::error::{BackendError, BackendResult};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;
use std::{
  collections::HashMap,
  path::{Path, PathBuf},
  sync::{Arc, Mutex},
  time::{SystemTime, UNIX_EPOCH},
};
mod maintenance;
#[cfg(test)]
mod maintenance_tests;
pub mod markdown;
mod ranges;
mod serving;
#[cfg(test)]
mod tests;

pub fn resource_url(value: &str) -> String {
  if let Some(path) = value.strip_prefix("marklab-asset://")
  {
    return format!("http://marklab-asset.localhost/{path}");
  }
  value.into()
}

fn remove_temporary(path: &Path) {
  #[cfg(windows)]
  if let Ok(metadata) = std::fs::metadata(path) {
    let mut permissions = metadata.permissions();
    permissions.set_readonly(false);
    let _ = std::fs::set_permissions(path, permissions);
  }
  let _ = std::fs::remove_file(path);
}

#[derive(Debug, Clone, Serialize, specta::Type)]
pub struct AssetCapability {
  pub url: String,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub expires_at_ms: u64,
}

#[derive(Clone)]
struct Grant {
  owner: String,
  path: PathBuf,
  identity: std::sync::Arc<same_file::Handle>,
  expires: u64,
  mime: String,
  temporary: bool,
  length: u64,
  modified: std::time::SystemTime,
}

pub struct AssetService {
  grants: Arc<Mutex<HashMap<String, Grant>>>,
  cache: PathBuf,
  _maintenance: Option<tokio::task::AbortHandle>,
}

pub fn now_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as u64)
    .unwrap_or(0)
}

impl AssetService {
  pub fn create_snapshot(&self, display_path: &str) -> BackendResult<tempfile::NamedTempFile> {
    let extension = Path::new(display_path)
      .extension()
      .and_then(|s| s.to_str())
      .filter(|s| s.chars().all(|c| c.is_ascii_alphanumeric()))
      .unwrap_or("bin");
    Ok(
      tempfile::Builder::new()
        .suffix(&format!(".{extension}"))
        .tempfile_in(&self.cache)?,
    )
  }

  pub fn issue_snapshot(
    &self,
    owner: &str,
    file: tempfile::NamedTempFile,
    _display_path: &str,
    mime: &str,
  ) -> BackendResult<AssetCapability> {
    let (_file, path) = file.keep().map_err(|e| BackendError::from(e.error))?;
    self.grant(owner, path, mime.into(), true)
  }

  pub fn resolve_capability_path(&self, owner: &str, url: &str) -> BackendResult<PathBuf> {
    let token = url
      .strip_prefix("marklab-asset://local/v1/")
      .or_else(|| url.strip_prefix("marklab-asset://remote/v1/"))
      .ok_or_else(|| BackendError::new("INVALID_ASSET", "Invalid preview capability"))?;
    self
      .grants
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Asset registry is unavailable"))?
      .get(token)
      .filter(|g| g.owner == owner && g.expires > now_ms())
      .map(|g| g.path.clone())
      .ok_or_else(|| BackendError::new("ASSET_EXPIRED", "Preview permission expired"))
  }

  pub fn new(data: &Path) -> BackendResult<Self> {
    let cache = maintenance::prepare_cache(data)?;
    // Capabilities are process-local. No file left by the previous process
    // can still be authorized; this directory never contains source files.
    maintenance::remove_orphans(&cache)?;
    let grants = Arc::new(Mutex::new(HashMap::new()));
    let maintenance = maintenance::schedule(&grants);
    Ok(Self {
      grants,
      cache,
      _maintenance: maintenance,
    })
  }

  pub fn issue_path(
    &self,
    owner: &str,
    path: &Path,
    _readonly: bool,
  ) -> BackendResult<AssetCapability> {
    let path = path.canonicalize()?;
    if !path.is_file() {
      return Err(BackendError::new(
        "INVALID_ASSET",
        "Asset is not a regular file",
      ));
    }
    let mime = mime_guess::from_path(&path)
      .first_or_octet_stream()
      .to_string();
    self.grant(owner, path, mime, false)
  }

  pub fn issue_bytes(
    &self,
    owner: &str,
    bytes: &[u8],
    display_path: &str,
    mime: &str,
  ) -> BackendResult<AssetCapability> {
    use std::io::Write;
    if bytes.len() > 128 * 1024 * 1024 {
      return Err(BackendError::new(
        "ASSET_TOO_LARGE",
        "Preview snapshot exceeds the supported size",
      ));
    }
    let mut file = self.create_snapshot(display_path)?;
    file.write_all(bytes)?;
    self.issue_snapshot(owner, file, display_path, mime)
  }

  pub fn issue_remote_bytes(
    &self,
    owner: &str,
    bytes: &[u8],
    mime: &str,
  ) -> BackendResult<AssetCapability> {
    let mut capability = self.issue_bytes(owner, bytes, "remote-preview.bin", mime)?;
    capability.url = capability.url.replacen("://local/", "://remote/", 1);
    Ok(capability)
  }

  fn grant(
    &self,
    owner: &str,
    path: PathBuf,
    mime: String,
    temporary: bool,
  ) -> BackendResult<AssetCapability> {
    let result = self.register_grant(owner, &path, mime, temporary);
    if result.is_err() && temporary {
      remove_temporary(&path);
    }
    result
  }

  fn register_grant(
    &self,
    owner: &str,
    path: &Path,
    mime: String,
    temporary: bool,
  ) -> BackendResult<AssetCapability> {
    let identity = std::sync::Arc::new(same_file::Handle::from_path(path)?);
    let metadata = std::fs::metadata(path)?;
    let modified = metadata.modified()?;
    let mut entropy = Vec::from(uuid::Uuid::new_v4().as_bytes());
    entropy.extend_from_slice(uuid::Uuid::new_v4().as_bytes());
    let token = URL_SAFE_NO_PAD.encode(entropy);
    let expires = now_ms() + 30 * 60 * 1000;
    let mut grants = self
      .grants
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Asset registry is unavailable"))?;
    maintenance::expire(&mut grants, now_ms());
    if grants.len() >= 4096 {
      return Err(BackendError::new(
        "ASSET_LIMIT",
        "Too many active preview assets",
      ));
    }
    maintenance::check_budget(&grants, if temporary { metadata.len() } else { 0 })?;
    grants.insert(
      token.clone(),
      Grant {
        owner: owner.into(),
        path: path.into(),
        identity,
        expires,
        mime,
        temporary,
        length: metadata.len(),
        modified,
      },
    );
    Ok(AssetCapability {
      url: format!("marklab-asset://local/v1/{token}"),
      expires_at_ms: expires,
    })
  }

  pub fn revoke_window(&self, owner: &str) -> BackendResult<()> {
    let mut grants = self
      .grants
      .lock()
      .map_err(|_| BackendError::new("STATE_ERROR", "Asset registry is unavailable"))?;
    grants.retain(|_, grant| {
      if grant.owner != owner {
        true
      } else {
        if grant.temporary {
          remove_temporary(&grant.path);
        }
        false
      }
    });
    Ok(())
  }
}

#[tauri::command]
#[specta::specta]
pub async fn assets_issue_capability(
  window: crate::native_window::TrustedWindow,
  registry: tauri::State<'_, crate::workspace::WorkspaceRegistry>,
  request: crate::workspace::types::PathRequest,
) -> BackendResult<AssetCapability> {
  use tauri::Manager;
  let workspace = registry.get(window.label())?;
  let _mutation = registry.lock_binding(window.label(), &workspace).await?;
  let workspace = workspace.clone();
  crate::blocking::run(move || {
    let path = super::workspace::safe_asset_path(&workspace, &request.path)?;
    window
      .state::<AssetService>()
      .issue_path(window.label(), &path, true)
  })
  .await
}
