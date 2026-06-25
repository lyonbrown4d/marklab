use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use ignore::WalkBuilder;
use path::WorkspacePathResolver;
use tokio::{fs, task};

mod path;
mod types;

pub use types::{VfsEntry, VfsEntryKind, VfsError, VfsMetadata, VfsMutation, VfsSnapshot};

#[derive(Debug, Clone)]
pub struct WorkspaceVfs {
  root: PathBuf,
  resolver: WorkspacePathResolver,
}

impl WorkspaceVfs {
  pub async fn open(root: impl Into<PathBuf>) -> Result<Self, VfsError> {
    let root = root.into();
    let canonical_root =
      fs::canonicalize(&root)
        .await
        .map_err(|source| VfsError::RootUnavailable {
          path: root.clone(),
          source,
        })?;
    let metadata =
      fs::metadata(&canonical_root)
        .await
        .map_err(|source| VfsError::RootUnavailable {
          path: canonical_root.clone(),
          source,
        })?;

    if !metadata.is_dir() {
      return Err(VfsError::RootNotDirectory {
        path: canonical_root,
      });
    }

    Ok(Self {
      root: canonical_root.clone(),
      resolver: WorkspacePathResolver::new(canonical_root),
    })
  }

  pub async fn snapshot(&self) -> Result<VfsSnapshot, VfsError> {
    let root = self.root.clone();
    let resolver = self.resolver.clone();

    task::spawn_blocking(move || build_snapshot(root, resolver))
      .await
      .map_err(|source| VfsError::TaskJoin { source })?
  }

  pub async fn read_file(&self, relative_path: &str) -> Result<String, VfsError> {
    let path = self.resolver.resolve_existing_file(relative_path).await?;
    fs::read_to_string(path)
      .await
      .map_err(|source| VfsError::ReadFile { source })
  }

  pub async fn create_file(&self, relative_path: &str) -> Result<VfsMutation, VfsError> {
    let path = self.resolver.resolve_mutation_path(relative_path).await?;
    match fs::metadata(&path).await {
      Ok(_) => {
        return Ok(VfsMutation {
          kind: VfsEntryKind::File,
          changed: false,
        });
      }
      Err(source) if source.kind() == std::io::ErrorKind::NotFound => {}
      Err(source) => return Err(VfsError::Metadata { source }),
    }

    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent)
        .await
        .map_err(|source| VfsError::CreatePath { source })?;
    }
    fs::write(path, "")
      .await
      .map_err(|source| VfsError::CreatePath { source })?;

    Ok(VfsMutation {
      kind: VfsEntryKind::File,
      changed: true,
    })
  }

  pub async fn create_dir(&self, relative_path: &str) -> Result<VfsMutation, VfsError> {
    let path = self.resolver.resolve_mutation_path(relative_path).await?;
    let changed = matches!(
      fs::metadata(&path).await,
      Err(source) if source.kind() == std::io::ErrorKind::NotFound
    );
    fs::create_dir_all(path)
      .await
      .map_err(|source| VfsError::CreatePath { source })?;

    Ok(VfsMutation {
      kind: VfsEntryKind::Folder,
      changed,
    })
  }

  pub async fn rename_path(&self, from: &str, to: &str) -> Result<VfsMutation, VfsError> {
    let source = self.resolver.resolve_existing_path(from).await?;
    let target = self.resolver.resolve_mutation_path(to).await?;
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent)
        .await
        .map_err(|source| VfsError::CreatePath { source })?;
    }
    fs::rename(source, &target)
      .await
      .map_err(|source| VfsError::RenamePath { source })?;
    let metadata = fs::metadata(&target)
      .await
      .map_err(|source| VfsError::Metadata { source })?;

    Ok(VfsMutation {
      kind: if metadata.is_dir() {
        VfsEntryKind::Folder
      } else {
        VfsEntryKind::File
      },
      changed: true,
    })
  }

  pub async fn delete_path(&self, relative_path: &str) -> Result<VfsMutation, VfsError> {
    let path = self.resolver.resolve_existing_path(relative_path).await?;
    let metadata = fs::metadata(&path)
      .await
      .map_err(|source| VfsError::Metadata { source })?;
    let kind = if metadata.is_dir() {
      fs::remove_dir_all(path)
        .await
        .map_err(|source| VfsError::DeletePath { source })?;
      VfsEntryKind::Folder
    } else {
      fs::remove_file(path)
        .await
        .map_err(|source| VfsError::DeletePath { source })?;
      VfsEntryKind::File
    };

    Ok(VfsMutation {
      kind,
      changed: true,
    })
  }

  pub async fn metadata(&self, relative_path: &str) -> Result<VfsMetadata, VfsError> {
    let path = self.resolver.resolve_existing_path(relative_path).await?;
    let metadata = fs::metadata(&path)
      .await
      .map_err(|source| VfsError::Metadata { source })?;
    let kind = if metadata.is_dir() {
      VfsEntryKind::Folder
    } else {
      VfsEntryKind::File
    };

    Ok(VfsMetadata {
      path: self.resolver.normalize_relative(relative_path)?,
      absolute_path: path.to_string_lossy().to_string(),
      kind,
      size_bytes: metadata.len(),
      modified_ms: metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs_f64() * 1000.0),
      readonly: metadata.permissions().readonly(),
    })
  }
}

fn build_snapshot(root: PathBuf, resolver: WorkspacePathResolver) -> Result<VfsSnapshot, VfsError> {
  let mut entries = Vec::new();
  let mut walker = WalkBuilder::new(&root);
  walker
    .follow_links(false)
    .hidden(true)
    .ignore(true)
    .git_ignore(true)
    .git_global(true)
    .git_exclude(true);

  for result in walker.build() {
    let entry = result.map_err(|source| VfsError::Walk { source })?;
    let path = entry.path();
    if path == root {
      continue;
    }

    let Some(file_type) = entry.file_type() else {
      continue;
    };
    let relative_path = resolver.relative_path(path)?;
    let name = path
      .file_name()
      .and_then(|value| value.to_str())
      .unwrap_or_default()
      .to_string();

    if file_type.is_dir() {
      entries.push(VfsEntry {
        path: relative_path,
        name,
        kind: VfsEntryKind::Folder,
      });
      continue;
    }

    if file_type.is_file() && is_workspace_document_path(path) {
      entries.push(VfsEntry {
        path: relative_path,
        name,
        kind: VfsEntryKind::File,
      });
    }
  }

  entries.sort_by(|left, right| left.path.cmp(&right.path));
  Ok(VfsSnapshot { entries })
}

fn is_workspace_document_path(path: &Path) -> bool {
  let extension = path
    .extension()
    .and_then(|value| value.to_str())
    .map(|value| value.to_ascii_lowercase());
  let Some(extension) = extension else {
    return false;
  };

  matches!(
    extension.as_str(),
    "aac"
      | "apng"
      | "avif"
      | "bmp"
      | "dio"
      | "docx"
      | "drawio"
      | "excalidraw"
      | "flac"
      | "gif"
      | "ico"
      | "ics"
      | "jpeg"
      | "jpg"
      | "m4a"
      | "m4v"
      | "markdown"
      | "md"
      | "mov"
      | "mp3"
      | "mp4"
      | "oga"
      | "ogg"
      | "ogv"
      | "opus"
      | "pdf"
      | "png"
      | "svg"
      | "wav"
      | "webm"
      | "webp"
  )
}

#[cfg(test)]
mod tests {
  use std::fs;
  use std::time::{SystemTime, UNIX_EPOCH};

  use super::*;

  #[tokio::test]
  async fn snapshot_lists_supported_files_and_folders() {
    let root = unique_test_dir("snapshot");
    fs::create_dir_all(root.join("notes")).expect("create notes dir");
    fs::write(root.join("notes").join("a.md"), "# A").expect("write markdown");
    fs::write(root.join("notes").join("ignored.txt"), "ignored").expect("write ignored");

    let snapshot = WorkspaceVfs::open(&root)
      .await
      .expect("open vfs")
      .snapshot()
      .await
      .expect("snapshot");

    assert!(snapshot.entries.iter().any(|entry| entry.path == "notes"));
    assert!(snapshot
      .entries
      .iter()
      .any(|entry| entry.path == "notes/a.md"));
    assert!(!snapshot
      .entries
      .iter()
      .any(|entry| entry.path == "notes/ignored.txt"));
  }

  #[tokio::test]
  async fn reads_file_inside_workspace() {
    let root = unique_test_dir("read");
    fs::write(root.join("a.md"), "# A").expect("write markdown");

    let content = WorkspaceVfs::open(&root)
      .await
      .expect("open vfs")
      .read_file("a.md")
      .await
      .expect("read file");

    assert_eq!(content, "# A");
  }

  #[tokio::test]
  async fn rejects_parent_paths() {
    let root = unique_test_dir("parent");
    let error = WorkspaceVfs::open(&root)
      .await
      .expect("open vfs")
      .read_file("../secret.md")
      .await
      .expect_err("parent path should be rejected");

    assert!(matches!(error, VfsError::ParentPath));
  }

  fn unique_test_dir(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time after unix epoch")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("marklab-workspace-vfs-{label}-{nanos}"));
    let _ = fs::remove_dir_all(&path);
    fs::create_dir_all(&path).expect("create test dir");
    path
  }
}
