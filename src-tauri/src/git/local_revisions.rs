use super::{
  process::{self, error},
  safety, status,
  types::*,
};
use crate::error::BackendResult;
use std::path::Path;
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
    super::sequencer::preflight(repo, &commit)?;
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
    if mode == git2::ResetType::Hard {
      super::lfs_checkout::tree(repo, &target.tree()?)?;
    }
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
