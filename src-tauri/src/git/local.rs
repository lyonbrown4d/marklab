use super::{
  process::{self, error},
  safety, status,
  types::*,
};
use crate::error::BackendResult;
use std::path::Path;
pub async fn paths(root: &Path, operation: &str, request: &PathsRequest) -> BackendResult<Status> {
  let snapshot = status::status(root).await?;
  let selected = safety::selected(root, &request.paths, &snapshot).await?;
  let operation = operation.to_owned();
  let root = root.to_owned();
  let inside = root.clone();
  process::repository(&root, move |repo| {
    let mut index = repo.index()?;
    match operation.as_str() {
      "stage" => {
        for file in &selected {
          let path = safety::worktree_file(&inside, file)?;
          if path.is_file() {
            index.add_path(Path::new(file))?;
          } else {
            index.remove_path(Path::new(file))?;
          }
        }
        index.write()?;
      }
      "unstage" => {
        let object = repo
          .head()
          .ok()
          .and_then(|head| head.peel_to_commit().ok())
          .map(|commit| commit.into_object());
        repo.reset_default(object.as_ref(), selected.iter().map(String::as_str))?;
      }
      "discard" => {
        status::no_operation_now(repo)?;
        if !snapshot.conflicts.is_empty() {
          return Err(error(
            "git_conflicts_present",
            "Resolve conflicts before discarding files",
          ));
        }
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force().disable_pathspec_match(true);
        let mut tracked = false;
        for file in &selected {
          if index.get_path(Path::new(file), 0).is_some() {
            checkout.path(file);
            tracked = true;
          }
        }
        if tracked {
          repo.checkout_index(Some(&mut index), Some(&mut checkout))?;
        }
        for file in selected
          .iter()
          .filter(|path| snapshot.untracked.iter().any(|entry| entry.path == **path))
        {
          let path = safety::worktree_file(&inside, file)?;
          if path.is_file() {
            std::fs::remove_file(path)?;
          }
        }
      }
      _ => return Err(error("git_invalid_input", "Invalid index operation")),
    }
    status::status_now(repo)
  })
  .await
}
pub fn commit_now(
  repo: &mut git2::Repository,
  message: &str,
  allow_merge: bool,
) -> BackendResult<git2::Oid> {
  let snapshot = status::status_now(repo)?;
  if !snapshot.conflicts.is_empty() {
    return Err(error(
      "git_conflicts_present",
      "Cannot commit while conflicts are present",
    ));
  }
  let operation = status::operation_now(repo).operation;
  if operation.as_deref().is_some_and(|v| v != "merge") || operation.is_some() && !allow_merge {
    return Err(error(
      "git_invalid_input",
      "Use Continue for the current Git operation",
    ));
  }
  if snapshot.staged.is_empty() && operation.as_deref() != Some("merge") {
    return Err(error("git_invalid_input", "No staged changes to commit"));
  }
  let mut parents = Vec::new();
  if let Ok(head) = repo.head().and_then(|v| v.peel_to_commit()) {
    parents.push(head.id());
  }
  if operation.as_deref() == Some("merge") {
    repo.mergehead_foreach(|oid| {
      parents.push(*oid);
      true
    })?;
  }
  let mut index = repo.index()?;
  let tree = repo.find_tree(index.write_tree()?)?;
  let parents = parents
    .into_iter()
    .map(|oid| repo.find_commit(oid))
    .collect::<Result<Vec<_>, _>>()?;
  let references = parents.iter().collect::<Vec<_>>();
  let signature = process::signature(repo)?;
  let oid = repo.commit(
    Some("HEAD"),
    &signature,
    &signature,
    message,
    &tree,
    &references,
  )?;
  if operation.is_some() {
    repo.cleanup_state()?;
  }
  Ok(oid)
}
pub async fn commit(root: &Path, message: &str, all: bool) -> BackendResult<Status> {
  let message = safety::message(message, false)?.to_owned();
  if all {
    status::no_operation(root).await?;
    let snapshot = status::status(root).await?;
    let paths = snapshot
      .staged
      .iter()
      .chain(&snapshot.unstaged)
      .chain(&snapshot.untracked)
      .map(|v| v.path.clone())
      .collect::<Vec<_>>();
    if paths.is_empty() {
      return Err(error("git_invalid_input", "No changes to commit"));
    }
    self::paths(
      root,
      "stage",
      &PathsRequest {
        expected_root: None,
        paths,
      },
    )
    .await?;
  }
  process::repository(root, move |repo| {
    commit_now(repo, &message, true)?;
    status::status_now(repo)
  })
  .await
}
pub async fn branch_action(
  root: &Path,
  operation: &str,
  request: &BranchRequest,
) -> BackendResult<Status> {
  let name = safety::branch_now(&request.name)?;
  let start = request.start_point.clone();
  let force = request.force.unwrap_or(false);
  let operation = operation.to_owned();
  process::repository(root, move |repo| {
    status::no_operation_now(repo)?;
    match operation.as_str() {
      "create" => {
        let commit = if let Some(start) = start {
          safety::start_now(repo, &start)?
        } else {
          repo.head()?.peel_to_commit()?
        };
        repo.branch(&name, &commit, false)?;
      }
      "switch" => {
        status::clean_now(repo)?;
        let branch = repo.find_branch(&name, git2::BranchType::Local)?;
        let reference = branch.get();
        let target = reference.peel_to_commit()?;
        repo.checkout_tree(
          target.as_object(),
          Some(git2::build::CheckoutBuilder::new().safe()),
        )?;
        repo.set_head(reference.name()?)?;
      }
      "delete" => {
        let mut branch = repo.find_branch(&name, git2::BranchType::Local)?;
        if branch.is_head() {
          return Err(error(
            "git_invalid_input",
            "Cannot delete the current branch",
          ));
        }
        if !force {
          let head = repo.head()?.peel_to_commit()?.id();
          let target = branch.get().peel_to_commit()?.id();
          if head != target && !repo.graph_descendant_of(head, target)? {
            return Err(error(
              "git_invalid_input",
              "Branch is not fully merged; force deletion must be explicit",
            ));
          }
        }
        branch.delete()?;
      }
      "merge" => {
        status::clean_now(repo)?;
        let target = safety::start_now(repo, &name)?.id();
        super::sequence::merge_now(repo, target)?;
      }
      "rebase" => {
        status::clean_now(repo)?;
        let target = safety::start_now(repo, &name)?.id();
        super::sequence::rebase_now(repo, target)?;
      }
      _ => return Err(error("git_invalid_input", "Invalid branch operation")),
    }
    status::status_now(repo)
  })
  .await
}
pub async fn revision_action(
  root: &Path,
  operation: &str,
  request: &RevisionRequest,
) -> BackendResult<Status> {
  let hash = request.commit.clone();
  let mainline = request.mainline;
  let operation = operation.to_owned();
  process::repository(root, move |repo| {
    status::clean_now(repo)?;
    let commit = safety::commit_now(repo, &hash)?;
    if operation == "revert" {
      if mainline.is_some_and(|v| v < 1 || v > commit.parent_count() as u32)
        || commit.parent_count() > 1 && mainline.is_none()
      {
        return Err(error(
          "git_invalid_input",
          "Choose a valid mainline parent to revert a merge",
        ));
      }
      let mut options = git2::RevertOptions::new();
      options.mainline(mainline.unwrap_or(0));
      repo.revert(&commit, Some(&mut options))?;
    } else {
      repo.cherrypick(&commit, None)?;
    }
    let message = if operation == "revert" {
      format!(
        "Revert \"{}\"\n\nThis reverts commit {}.",
        commit.summary()?.unwrap_or(""),
        commit.id()
      )
    } else {
      commit.message().unwrap_or("Cherry-pick").to_owned()
    };
    drop(commit);
    if repo.index()?.has_conflicts() {
      return Err(error(
        "git_conflicts_present",
        "Resolve conflicts before continuing the operation",
      ));
    }
    super::sequence::finish_simple(repo, &message)?;
    status::status_now(repo)
  })
  .await
}
pub async fn reset(root: &Path, request: &RevisionRequest) -> BackendResult<ResetResult> {
  let hash = request.commit.clone();
  let mode = match request.mode.as_deref() {
    Some("soft") => git2::ResetType::Soft,
    Some("mixed") => git2::ResetType::Mixed,
    Some("hard") => git2::ResetType::Hard,
    _ => return Err(error("git_invalid_input", "Invalid reset mode")),
  };
  process::repository(root, move |repo| {
    status::clean_now(repo)?;
    let target = safety::commit_now(repo, &hash)?;
    let head = repo.head()?.peel_to_commit()?;
    let backup_branch = format!("marklab-backup-{}", uuid::Uuid::new_v4());
    repo.branch(&backup_branch, &head, false)?;
    repo.reset(
      target.as_object(),
      mode,
      Some(git2::build::CheckoutBuilder::new().force()),
    )?;
    Ok(ResetResult {
      status: status::status_now(repo)?,
      backup_branch,
    })
  })
  .await
}
pub use super::sequence::sequence;
pub use super::stash::{stash_action, stash_save};
