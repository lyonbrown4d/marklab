//! One-time bundled guide installation. A pending marker resumes interrupted
//! copies without overwriting edits or reclaiming a user-owned guide directory.
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use std::{
  io::Write,
  path::{Path, PathBuf},
};
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct State {
  version: u8,
  status: String,
  locale: String,
}

pub async fn initialize(data: PathBuf, resources: PathBuf, locale: String) -> BackendResult<()> {
  crate::blocking::run(move || install(&data, &resources, &locale)).await
}
fn install(data: &Path, resources: &Path, locale: &str) -> BackendResult<()> {
  let marker = data.join("workspace-user-guide.json");
  let previous: Option<State> = match std::fs::symlink_metadata(&marker) {
    Ok(info) => {
      if !info.is_file() || info.file_type().is_symlink() || info.len() > 4096 {
        return Err(invalid());
      }
      let state: State = serde_json::from_slice(&std::fs::read(&marker)?)?;
      if state.version != 1
        || !matches!(state.status.as_str(), "pending" | "done")
        || !matches!(state.locale.as_str(), "en-US" | "zh-CN")
      {
        return Err(invalid());
      }
      Some(state)
    }
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
    Err(error) => return Err(error.into()),
  };
  if previous
    .as_ref()
    .is_some_and(|state| state.status == "done")
  {
    return Ok(());
  }
  let selected = previous
    .as_ref()
    .map(|state| state.locale.as_str())
    .unwrap_or(if locale.to_ascii_lowercase().starts_with("en") {
      "en-US"
    } else {
      "zh-CN"
    });
  let source = resources.join(selected);
  regular_directory(&source.join("User Guide"))?;
  if !source.join("Home.md").is_file() {
    return Err(BackendError::new(
      "GUIDE_UNAVAILABLE",
      "Bundled guide is incomplete",
    ));
  }
  let root = data.join("workspace");
  std::fs::create_dir_all(&root)?;
  regular_directory(&root)?;
  let destination = root.join("User Guide");
  if previous.is_none() && std::fs::symlink_metadata(&destination).is_ok() {
    return write_state(&marker, "done", selected);
  }
  if previous.is_none() {
    write_state(&marker, "pending", selected)?;
  }
  std::fs::create_dir_all(&destination)?;
  regular_directory(&destination)?;
  copy_missing(&source.join("User Guide"), &destination)?;
  let home_exists = std::fs::read_dir(&root)?
    .filter_map(Result::ok)
    .any(|entry| {
      entry
        .file_name()
        .to_string_lossy()
        .eq_ignore_ascii_case("home.md")
    });
  if !home_exists {
    copy_exclusive(&source.join("Home.md"), &root.join("Home.md"))?;
  }
  write_state(&marker, "done", selected)
}
fn copy_missing(source: &Path, destination: &Path) -> BackendResult<()> {
  for entry in std::fs::read_dir(source)? {
    let entry = entry?;
    let kind = entry.file_type()?;
    if kind.is_symlink() {
      return Err(BackendError::new(
        "GUIDE_UNAVAILABLE",
        "Bundled guide contains a symbolic link",
      ));
    }
    let target = destination.join(entry.file_name());
    if kind.is_dir() {
      if let Ok(info) = std::fs::symlink_metadata(&target) {
        if !info.is_dir() || info.file_type().is_symlink() {
          continue;
        }
      } else {
        std::fs::create_dir(&target)?;
      }
      copy_missing(&entry.path(), &target)?;
    } else if kind.is_file() {
      copy_exclusive(&entry.path(), &target)?;
    }
  }
  Ok(())
}
fn copy_exclusive(source: &Path, destination: &Path) -> BackendResult<()> {
  let mut output = match std::fs::OpenOptions::new()
    .write(true)
    .create_new(true)
    .open(destination)
  {
    Ok(file) => file,
    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => return Ok(()),
    Err(error) => return Err(error.into()),
  };
  if let Err(error) =
    std::io::copy(&mut std::fs::File::open(source)?, &mut output).and_then(|_| output.sync_all())
  {
    drop(output);
    let _ = std::fs::remove_file(destination);
    return Err(error.into());
  }
  Ok(())
}
fn write_state(path: &Path, status: &str, locale: &str) -> BackendResult<()> {
  let parent = path.parent().ok_or_else(invalid)?;
  let mut file = tempfile::NamedTempFile::new_in(parent)?;
  file.write_all(&serde_json::to_vec(&State {
    version: 1,
    status: status.into(),
    locale: locale.into(),
  })?)?;
  file.as_file().sync_all()?;
  file
    .persist(path)
    .map_err(|error| BackendError::from(error.error))?;
  #[cfg(unix)]
  std::fs::File::open(parent)?.sync_all()?;
  Ok(())
}
fn regular_directory(path: &Path) -> BackendResult<()> {
  let info = std::fs::symlink_metadata(path)?;
  if !info.is_dir() || info.file_type().is_symlink() {
    return Err(invalid());
  }
  Ok(())
}
fn invalid() -> BackendError {
  BackendError::new(
    "INVALID_GUIDE_STATE",
    "Guide installation requires regular owned directories and valid state",
  )
}
