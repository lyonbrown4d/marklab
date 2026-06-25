use std::io;
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VfsEntryKind {
  File,
  Folder,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VfsEntry {
  pub path: String,
  pub name: String,
  pub kind: VfsEntryKind,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VfsSnapshot {
  pub entries: Vec<VfsEntry>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VfsMetadata {
  pub path: String,
  pub absolute_path: String,
  pub kind: VfsEntryKind,
  pub size_bytes: u64,
  pub modified_ms: Option<f64>,
  pub readonly: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum VfsError {
  #[error("Workspace root is not available: {path}")]
  RootUnavailable { path: PathBuf, source: io::Error },
  #[error("Workspace root is not a directory: {path}")]
  RootNotDirectory { path: PathBuf },
  #[error("Path must not be empty")]
  EmptyPath,
  #[error("Path contains invalid characters")]
  InvalidCharacters,
  #[error("Path must be relative")]
  AbsolutePath,
  #[error("Parent paths are not allowed")]
  ParentPath,
  #[error("Path must stay inside the current workspace")]
  EscapesWorkspace,
  #[error("Path is not a file")]
  NotFile,
  #[error("Workspace background task failed")]
  TaskJoin { source: tokio::task::JoinError },
  #[error("Workspace walk failed")]
  Walk { source: ignore::Error },
  #[error("Workspace path error")]
  Path { source: io::Error },
  #[error("Workspace metadata read failed")]
  Metadata { source: io::Error },
  #[error("Workspace file read failed")]
  ReadFile { source: io::Error },
}
