use super::{
  process::{self, error},
  types::Status,
};
use crate::{error::BackendResult, workspace::WorkspaceRegistry};
use std::{
  collections::BTreeSet,
  path::{Path, PathBuf},
};
pub fn workspace_root(
  window: &crate::native_window::TrustedWindow,
  registry: &WorkspaceRegistry,
  expected: Option<&str>,
) -> BackendResult<PathBuf> {
  let workspace = registry.get(window.label())?;
  let info = workspace.root_info();
  workspace.ensure_active()?;
  if info.kind == crate::workspace::RootKind::Single {
    return Err(error(
      "git_workspace_boundary",
      "Git requires a directory workspace",
    ));
  }
  if expected.is_some_and(|value| value != info.path) {
    return Err(error(
      "git_workspace_boundary",
      "Workspace changed; refresh before running Git",
    ));
  }
  Ok(workspace.root_directory())
}
pub async fn repository(root: &Path, allow_missing: bool) -> BackendResult<bool> {
  let root = root.to_owned();
  crate::blocking::run(move || {
    let repository = match process::open(&root) {
      Ok(repository) => repository,
      Err(error) if allow_missing && error.code == "git_not_repository" => return Ok(false),
      Err(error) => return Err(error),
    };
    let common = repository.commondir();
    for path in [
      common.join("config"),
      repository.path().join("config.worktree"),
    ] {
      if !path.is_file() {
        continue;
      }
      let config = git2::Config::open(&path)?;
      let mut entries = config.entries(None)?;
      while let Some(entry) = entries.next() {
        let entry = entry?;
        let name = entry.name()?.to_ascii_lowercase();
        if unsafe_key(&name) {
          return Err(error(
            "git_unsafe_configuration",
            &format!("Repository contains unsafe Git configuration: {name}"),
          ));
        }
      }
    }
    Ok(true)
  })
  .await
}
fn unsafe_key(key: &str) -> bool {
  key.starts_with("alias.")
    || key.starts_with("include.")
    || key.starts_with("includeif.")
    || key.starts_with("url.")
    || [
      "core.askpass",
      "core.editor",
      "core.fsmonitor",
      "core.gitproxy",
      "core.hookspath",
      "core.sshcommand",
      "diff.external",
      "sequence.editor",
    ]
    .contains(&key)
    || (key.starts_with("credential.") && key.ends_with(".helper"))
    || (key.starts_with("diff.") && (key.ends_with(".command") || key.ends_with(".textconv")))
    || (key.starts_with("filter.")
      && [".clean", ".process", ".smudge"]
        .iter()
        .any(|v| key.ends_with(v)))
    || (key.starts_with("gpg.")
      && (key.ends_with(".program") || key.ends_with(".defaultkeycommand")))
    || (key.starts_with("merge.") && key.ends_with(".driver"))
    || key.starts_with("mergetool.")
    || key.starts_with("difftool.")
    || (key.starts_with("protocol.") && key.ends_with(".allow"))
    || (key.starts_with("remote.")
      && [".receivepack", ".uploadpack", ".vcs"]
        .iter()
        .any(|v| key.ends_with(v)))
    || (key.starts_with("submodule.") && key.ends_with(".update"))
}
pub fn file_path(value: &str) -> BackendResult<&str> {
  if value.is_empty()
    || value.len() > 32768
    || value.contains(['\0', '\\'])
    || Path::new(value).is_absolute()
    || value.as_bytes().get(1) == Some(&b':')
    || value.split('/').any(|part| {
      part.is_empty()
        || part == "."
        || part == ".."
        || part.eq_ignore_ascii_case(".git")
        || cfg!(windows)
          && (part.ends_with(['.', ' '])
            || part.contains(['<', '>', ':', '"', '|', '?', '*'])
            || part.to_ascii_lowercase().starts_with("git~"))
    })
  {
    return Err(error(
      "git_workspace_boundary",
      "Git path must name a file inside the worktree",
    ));
  }
  Ok(value)
}
pub fn worktree_file(root: &Path, file: &str) -> BackendResult<PathBuf> {
  file_path(file)?;
  let mut candidate = root.to_path_buf();
  let parts: Vec<_> = file.split('/').collect();
  for (index, part) in parts.iter().enumerate() {
    candidate.push(part);
    match std::fs::symlink_metadata(&candidate) {
      Ok(stat)
        if stat.file_type().is_symlink()
          || (if index + 1 == parts.len() {
            !stat.is_file()
          } else {
            !stat.is_dir()
          }) =>
      {
        return Err(error(
          "git_workspace_boundary",
          "Symlinks, directories and special files cannot be changed here",
        ));
      }
      Ok(_) => (),
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
        for tail in &parts[index + 1..] {
          candidate.push(tail);
        }
        break;
      }
      Err(e) => return Err(e.into()),
    }
  }
  Ok(candidate)
}
pub async fn selected(
  root: &Path,
  paths: &[String],
  status: &Status,
) -> BackendResult<Vec<String>> {
  if paths.is_empty() || paths.len() > 10000 {
    return Err(error(
      "git_invalid_input",
      "Select between 1 and 10000 Git files",
    ));
  }
  let mut files = paths
    .iter()
    .map(|p| file_path(p).map(str::to_owned))
    .collect::<BackendResult<BTreeSet<_>>>()?;
  for change in status
    .staged
    .iter()
    .chain(&status.unstaged)
    .chain(&status.conflicts)
  {
    if let Some(old) = &change.old_path
      && (files.contains(&change.path) || files.contains(old))
    {
      files.insert(file_path(&change.path)?.into());
      files.insert(file_path(old)?.into());
    }
  }
  let index_root = root.to_owned();
  let submodules = crate::blocking::run(move || {
    let repository = process::open(&index_root)?;
    Ok(
      repository
        .index()?
        .iter()
        .filter(|entry| entry.mode == 0o160000)
        .filter_map(|entry| String::from_utf8(entry.path).ok())
        .collect::<Vec<_>>(),
    )
  })
  .await?;
  if files.iter().any(|file| {
    submodules
      .iter()
      .any(|module| file == module || file.starts_with(&format!("{module}/")))
  }) {
    return Err(error(
      "git_workspace_boundary",
      "Submodule paths cannot be changed here",
    ));
  }
  for file in &files {
    worktree_path(root, file).await?;
  }
  Ok(files.into_iter().collect())
}
pub fn hash(value: &str) -> BackendResult<&str> {
  if ![40, 64].contains(&value.len()) || !value.bytes().all(|v| v.is_ascii_hexdigit()) {
    return Err(error(
      "git_invalid_input",
      "A full Git commit hash is required",
    ));
  }
  Ok(value)
}
pub fn commit_now<'a>(repo: &'a git2::Repository, value: &str) -> BackendResult<git2::Commit<'a>> {
  hash(value)?;
  Ok(repo.find_commit(git2::Oid::from_str(value)?)?)
}
pub fn branch_now(value: &str) -> BackendResult<String> {
  if value.is_empty()
    || value.len() > 1024
    || value == "HEAD"
    || value.starts_with('-')
    || !git2::Reference::is_valid_name(&format!("refs/heads/{value}"))
  {
    return Err(error("git_invalid_input", "Invalid branch name"));
  }
  Ok(value.to_owned())
}
pub fn start_now<'a>(repo: &'a git2::Repository, value: &str) -> BackendResult<git2::Commit<'a>> {
  if hash(value).is_ok() {
    return commit_now(repo, value);
  }
  let name = branch_now(value)?;
  let branch = repo
    .find_branch(&name, git2::BranchType::Local)
    .or_else(|_| repo.find_branch(&name, git2::BranchType::Remote))?;
  Ok(branch.get().peel_to_commit()?)
}
pub fn message(value: &str, allow_empty: bool) -> BackendResult<&str> {
  if (!allow_empty && value.trim().is_empty()) || value.len() > 10000 || value.contains('\0') {
    return Err(error("git_invalid_input", "Invalid Git message"));
  }
  Ok(value.trim())
}

pub async fn worktree_path(root: &Path, file: &str) -> BackendResult<PathBuf> {
  let root = root.to_owned();
  let file = file.to_owned();
  super::blocking::filesystem(move || worktree_file(&root, &file)).await
}
