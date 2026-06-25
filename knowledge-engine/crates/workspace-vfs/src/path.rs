use std::path::{Component, Path, PathBuf};

use camino::Utf8Path;
use path_clean::PathClean;
use tokio::fs;

use crate::types::VfsError;

#[derive(Debug, Clone)]
pub(crate) struct WorkspacePathResolver {
  root: PathBuf,
}

impl WorkspacePathResolver {
  pub(crate) fn new(root: PathBuf) -> Self {
    Self { root }
  }

  pub(crate) async fn resolve_existing_path(
    &self,
    relative_path: &str,
  ) -> Result<PathBuf, VfsError> {
    self.validate_relative_path(relative_path)?;
    let candidate = self.root.join(Path::new(relative_path)).clean();
    let canonical = fs::canonicalize(candidate)
      .await
      .map_err(|source| VfsError::Path { source })?;
    if !is_path_inside_or_equal(&self.root, &canonical) {
      return Err(VfsError::EscapesWorkspace);
    }
    Ok(canonical)
  }

  pub(crate) async fn resolve_existing_file(
    &self,
    relative_path: &str,
  ) -> Result<PathBuf, VfsError> {
    let path = self.resolve_existing_path(relative_path).await?;
    let metadata = fs::metadata(&path)
      .await
      .map_err(|source| VfsError::Metadata { source })?;
    if !metadata.is_file() {
      return Err(VfsError::NotFile);
    }
    Ok(path)
  }

  pub(crate) fn relative_path(&self, path: &Path) -> Result<String, VfsError> {
    path
      .strip_prefix(&self.root)
      .map(normalize_path)
      .map_err(|source| VfsError::Path {
        source: std::io::Error::other(source.to_string()),
      })
  }

  pub(crate) fn normalize_relative(&self, relative_path: &str) -> Result<String, VfsError> {
    self.validate_relative_path(relative_path)?;
    Ok(normalize_path(Path::new(relative_path).clean().as_path()))
  }

  fn validate_relative_path(&self, value: &str) -> Result<(), VfsError> {
    if value.trim().is_empty() {
      return Err(VfsError::EmptyPath);
    }
    if value.contains('\0') {
      return Err(VfsError::InvalidCharacters);
    }
    if looks_like_uri_scheme(value) || Path::new(value).is_absolute() {
      return Err(VfsError::AbsolutePath);
    }
    for component in Path::new(value).components() {
      if matches!(
        component,
        Component::ParentDir | Component::Prefix(_) | Component::RootDir
      ) {
        return Err(VfsError::ParentPath);
      }
    }
    Ok(())
  }
}

fn normalize_path(path: &Path) -> String {
  let value = path.to_string_lossy().replace('\\', "/");
  Utf8Path::new(&value).as_str().to_string()
}

fn is_path_inside_or_equal(root: &Path, absolute_path: &Path) -> bool {
  absolute_path == root || absolute_path.starts_with(root)
}

fn looks_like_uri_scheme(value: &str) -> bool {
  let Some(index) = value.find(':') else {
    return false;
  };
  let scheme = &value[..index];
  !scheme.is_empty()
    && scheme.chars().enumerate().all(|(index, ch)| {
      if index == 0 {
        ch.is_ascii_alphabetic()
      } else {
        ch.is_ascii_alphanumeric() || matches!(ch, '+' | '.' | '-')
      }
    })
}
