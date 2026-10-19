use crate::error::BackendResult;
use std::path::PathBuf;
use tauri::AppHandle;
#[cfg(not(all(debug_assertions, feature = "e2e-testing")))]
use tauri::Manager;

pub(crate) struct AppPaths {
  pub data_dir: PathBuf,
  pub cache_dir: PathBuf,
}

impl AppPaths {
  #[cfg(not(all(debug_assertions, feature = "e2e-testing")))]
  pub async fn resolve(app: &AppHandle) -> BackendResult<Self> {
    Ok(Self {
      data_dir: app.path().app_data_dir()?.join("v1"),
      cache_dir: app.path().app_cache_dir()?,
    })
  }

  #[cfg(all(debug_assertions, feature = "e2e-testing"))]
  pub async fn resolve(_app: &AppHandle) -> BackendResult<Self> {
    Self::isolated(
      std::env::var_os("MARKLAB_E2E_DATA_DIR").map(PathBuf::from),
      std::env::var_os("MARKLAB_E2E_CACHE_DIR").map(PathBuf::from),
    )
    .await
  }

  #[cfg(any(test, all(debug_assertions, feature = "e2e-testing")))]
  async fn isolated(data: Option<PathBuf>, cache: Option<PathBuf>) -> BackendResult<Self> {
    let data = test_directory("MARKLAB_E2E_DATA_DIR", data).await?;
    let cache = test_directory("MARKLAB_E2E_CACHE_DIR", cache).await?;
    if data.starts_with(&cache) || cache.starts_with(&data) {
      return Err(crate::error::BackendError::new(
        "E2E_PATHS_INVALID",
        "Native E2E data and cache directories must not overlap",
      ));
    }
    Ok(Self {
      data_dir: data.join("v1"),
      cache_dir: cache,
    })
  }
}

#[cfg(any(test, all(debug_assertions, feature = "e2e-testing")))]
async fn test_directory(name: &str, path: Option<PathBuf>) -> BackendResult<PathBuf> {
  use crate::error::BackendError;
  let invalid = || {
    BackendError::new(
      "E2E_PATHS_INVALID",
      format!("{name} must name an existing absolute canonical directory"),
    )
  };
  let path = path.ok_or_else(invalid)?;
  if !path.is_absolute() {
    return Err(invalid());
  }
  let canonical = tokio::fs::canonicalize(&path)
    .await
    .map_err(|_| invalid())?;
  if canonical != path
    || !tokio::fs::metadata(&canonical)
      .await
      .map_err(|_| invalid())?
      .is_dir()
  {
    return Err(invalid());
  }
  Ok(canonical)
}

#[cfg(test)]
#[path = "paths_tests.rs"]
mod tests;
