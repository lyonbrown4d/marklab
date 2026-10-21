use super::{
  process::{self, error},
  types::*,
};
use crate::error::BackendResult;
use std::path::Path;
pub fn repo_now(repository: &git2::Repository) -> BackendResult<RepoInfo> {
  let head = repository.head().ok();
  let branch = if let Some(head) = head.as_ref().filter(|v| v.is_branch()) {
    Some(head.shorthand()?.to_owned())
  } else {
    repository.find_reference("HEAD").ok().and_then(|v| {
      v.symbolic_target()
        .ok()
        .flatten()
        .and_then(|name| name.strip_prefix("refs/heads/"))
        .map(str::to_owned)
    })
  };
  Ok(RepoInfo {
    is_repository: true,
    workdir: repository.workdir().map(|v| {
      v.to_string_lossy()
        .trim_end_matches(std::path::MAIN_SEPARATOR)
        .to_owned()
    }),
    git_dir: Some(
      repository
        .path()
        .to_string_lossy()
        .trim_end_matches(std::path::MAIN_SEPARATOR)
        .into(),
    ),
    branch,
    head: head.and_then(|v| v.target()).map(|v| v.to_string()),
  })
}
pub async fn repo(root: &Path) -> BackendResult<RepoInfo> {
  process::repository(root, |repo| repo_now(repo)).await
}
pub fn status_now(repository: &git2::Repository) -> BackendResult<Status> {
  let mut options = git2::StatusOptions::new();
  options
    .include_untracked(true)
    .recurse_untracked_dirs(true)
    .renames_head_to_index(true)
    .renames_index_to_workdir(true);
  let mut snapshot = Status {
    repo: repo_now(repository)?,
    ..Status::default()
  };
  for entry in repository.statuses(Some(&mut options))?.iter() {
    let flags = entry.status();
    let path = entry.path()?.to_owned();
    if flags.contains(git2::Status::CONFLICTED) {
      let detail = repository
        .index()?
        .conflict_get(Path::new(&path))
        .ok()
        .map(
          |v| match (v.ancestor.is_some(), v.our.is_some(), v.their.is_some()) {
            (_, false, false) => "DD",
            (_, false, true) => "DU",
            (_, true, false) => "UD",
            (false, true, true) => "AA",
            _ => "UU",
          },
        )
        .unwrap_or("UU");
      snapshot.conflicts.push(change(
        None,
        false,
        &path,
        ChangeStatus::Conflicted,
        detail,
      )?);
      continue;
    }
    if flags.contains(git2::Status::WT_NEW) {
      snapshot.untracked.push(change(
        entry.index_to_workdir(),
        false,
        &path,
        ChangeStatus::Untracked,
        "worktree",
      )?);
    }
    for (code, name) in [
      (git2::Status::INDEX_NEW, ChangeStatus::Added),
      (
        git2::Status::INDEX_MODIFIED | git2::Status::INDEX_TYPECHANGE,
        ChangeStatus::Modified,
      ),
      (git2::Status::INDEX_DELETED, ChangeStatus::Deleted),
      (git2::Status::INDEX_RENAMED, ChangeStatus::Renamed),
    ] {
      if flags.intersects(code) {
        snapshot.staged.push(change(
          entry.head_to_index(),
          flags.contains(git2::Status::INDEX_RENAMED),
          &path,
          name,
          "index",
        )?);
        break;
      }
    }
    for (code, name) in [
      (
        git2::Status::WT_MODIFIED | git2::Status::WT_TYPECHANGE,
        ChangeStatus::Modified,
      ),
      (git2::Status::WT_DELETED, ChangeStatus::Deleted),
      (git2::Status::WT_RENAMED, ChangeStatus::Renamed),
    ] {
      if flags.intersects(code) {
        snapshot.unstaged.push(change(
          entry.index_to_workdir(),
          flags.contains(git2::Status::WT_RENAMED),
          &path,
          name,
          "worktree",
        )?);
        break;
      }
    }
  }
  for entries in [
    &mut snapshot.staged,
    &mut snapshot.unstaged,
    &mut snapshot.untracked,
    &mut snapshot.conflicts,
  ] {
    entries.sort_by(|a, b| a.path.cmp(&b.path));
  }
  Ok(snapshot)
}
pub async fn status(root: &Path) -> BackendResult<Status> {
  process::repository(root, |repo| status_now(repo)).await
}
pub fn operation_now(repository: &git2::Repository) -> Operation {
  use git2::RepositoryState::*;
  let operation = match repository.state() {
    Merge => Some(OperationKind::Merge),
    Rebase | RebaseInteractive | RebaseMerge | ApplyMailboxOrRebase => Some(OperationKind::Rebase),
    Revert | RevertSequence => Some(OperationKind::Revert),
    CherryPick | CherryPickSequence => Some(OperationKind::CherryPick),
    _ => None,
  };
  Operation { operation }
}
pub async fn operation(root: &Path) -> BackendResult<Operation> {
  process::repository(root, |repo| Ok(operation_now(repo))).await
}
pub fn no_operation_now(repository: &git2::Repository) -> BackendResult<()> {
  if repository.state() != git2::RepositoryState::Clean {
    return Err(error(
      "git_invalid_input",
      "Finish or abort the current Git operation first",
    ));
  }
  Ok(())
}
pub fn clean_now(repository: &git2::Repository) -> BackendResult<()> {
  no_operation_now(repository)?;
  let snapshot = status_now(repository)?;
  if !snapshot.conflicts.is_empty() {
    return Err(error(
      "git_conflicts_present",
      "Resolve Git conflicts first",
    ));
  }
  if !snapshot.staged.is_empty() || !snapshot.unstaged.is_empty() || !snapshot.untracked.is_empty()
  {
    return Err(error(
      "git_dirty_worktree",
      "Commit or stash all changes before this operation",
    ));
  }
  Ok(())
}
pub async fn no_operation(root: &Path) -> BackendResult<()> {
  process::repository(root, |repo| no_operation_now(repo)).await
}

fn change(
  delta: Option<git2::DiffDelta<'_>>,
  renamed: bool,
  fallback: &str,
  name: ChangeStatus,
  detail: &str,
) -> BackendResult<Change> {
  let text = |path: &Path| {
    path
      .to_str()
      .map(str::to_owned)
      .ok_or_else(|| error("git_invalid_input", "Git paths must be valid UTF-8"))
  };
  let path = delta
    .as_ref()
    .and_then(|delta| delta.new_file().path())
    .map(text)
    .transpose()?
    .unwrap_or_else(|| fallback.into());
  let old_path = if renamed {
    delta
      .as_ref()
      .and_then(|delta| delta.old_file().path())
      .map(text)
      .transpose()?
  } else {
    None
  };
  Ok(Change {
    path,
    old_path,
    status: name,
    detail: detail.into(),
  })
}
