use super::{
  process::{self, error},
  status,
};
use crate::error::BackendResult;
pub fn finish_simple(repo: &git2::Repository, message: &str) -> BackendResult<git2::Oid> {
  let mut index = repo.index()?;
  if index.has_conflicts() {
    return Err(error(
      "git_conflicts_present",
      "Resolve conflicts before continuing",
    ));
  }
  let tree = repo.find_tree(index.write_tree()?)?;
  let parent = repo.head()?.peel_to_commit()?;
  let signature = process::signature(repo)?;
  let source = repo
    .find_reference("CHERRY_PICK_HEAD")
    .ok()
    .and_then(|v| v.peel_to_commit().ok());
  let author = source
    .as_ref()
    .map(|v| v.author())
    .unwrap_or_else(|| signature.clone());
  let oid = repo.commit(
    Some("HEAD"),
    &author,
    &signature,
    message,
    &tree,
    &[&parent],
  )?;
  repo.cleanup_state()?;
  Ok(oid)
}
pub fn merge_now(repo: &mut git2::Repository, target: git2::Oid) -> BackendResult<()> {
  let target = repo.find_annotated_commit(target)?;
  let (analysis, _) = repo.merge_analysis(&[&target])?;
  if analysis.is_up_to_date() {
    return Ok(());
  }
  let head = repo.head()?.peel_to_commit()?;
  repo.reference("ORIG_HEAD", head.id(), true, "marklab: before merge")?;
  if analysis.is_fast_forward() {
    let commit = repo.find_commit(target.id())?;
    repo.checkout_tree(
      commit.as_object(),
      Some(git2::build::CheckoutBuilder::new().safe()),
    )?;
    repo
      .head()?
      .set_target(target.id(), "merge: fast-forward")?;
    return Ok(());
  }
  repo.merge(
    &[&target],
    None,
    Some(
      git2::build::CheckoutBuilder::new()
        .safe()
        .allow_conflicts(true),
    ),
  )?;
  if repo.index()?.has_conflicts() {
    return Err(error(
      "git_conflicts_present",
      "Merge produced conflicts; resolve or abort the operation",
    ));
  }
  let mut index = repo.index()?;
  let tree = repo.find_tree(index.write_tree()?)?;
  let other = repo.find_commit(target.id())?;
  let signature = process::signature(repo)?;
  repo.commit(
    Some("HEAD"),
    &signature,
    &signature,
    &format!("Merge commit '{}'", target.id()),
    &tree,
    &[&head, &other],
  )?;
  repo.cleanup_state()?;
  Ok(())
}
pub fn rebase_now(repo: &git2::Repository, target: git2::Oid) -> BackendResult<()> {
  let target = repo.find_annotated_commit(target)?;
  let mut options = git2::RebaseOptions::new();
  let mut rebase = repo.rebase(None, Some(&target), None, Some(&mut options))?;
  advance_rebase(repo, &mut rebase, false)
}
fn advance_rebase(
  repo: &git2::Repository,
  rebase: &mut git2::Rebase<'_>,
  continue_current: bool,
) -> BackendResult<()> {
  let signature = process::signature(repo)?;
  if continue_current {
    if repo.index()?.has_conflicts() {
      return Err(error(
        "git_conflicts_present",
        "Stage all resolved conflicts before continuing",
      ));
    }
    match rebase.commit(None, &signature, None) {
      Ok(_) => (),
      Err(error) if error.code() == git2::ErrorCode::Applied => (),
      Err(error) => return Err(error.into()),
    }
  }
  while let Some(operation) = rebase.next() {
    let operation = operation?;
    if operation.kind() == Some(git2::RebaseOperationType::Exec) {
      return Err(error(
        "git_unsafe_configuration",
        "Rebase contains shell execution steps; continue it externally",
      ));
    }
    if repo.index()?.has_conflicts() {
      return Err(error(
        "git_conflicts_present",
        "Rebase produced conflicts; resolve or abort the operation",
      ));
    }
    match rebase.commit(None, &signature, None) {
      Ok(_) => (),
      Err(error) if error.code() == git2::ErrorCode::Applied => (),
      Err(error) => return Err(error.into()),
    }
  }
  rebase.finish(Some(&signature))?;
  Ok(())
}
pub fn sequence_now(repo: &mut git2::Repository, abort: bool) -> BackendResult<()> {
  let operation = status::operation_now(repo)
    .operation
    .ok_or_else(|| error("git_invalid_input", "No Git operation is in progress"))?;
  if operation == "rebase" {
    let todo = metadata(repo, "rebase-merge/git-rebase-todo")?.unwrap_or_default();
    if !abort
      && todo.lines().any(|line| {
        line
          .split_whitespace()
          .next()
          .is_some_and(|v| v == "exec" || v == "x")
      })
    {
      return Err(error(
        "git_unsafe_configuration",
        "Rebase contains shell execution steps; continue it externally",
      ));
    }
    let mut rebase = repo.open_rebase(None)?;
    if abort {
      rebase.abort()?;
      return Ok(());
    }
    return advance_rebase(repo, &mut rebase, true);
  }
  if abort {
    let original = metadata(repo, "sequencer/head")?
      .and_then(|v| git2::Oid::from_str(v.trim()).ok())
      .or_else(|| {
        if operation == "merge" {
          repo
            .find_reference("ORIG_HEAD")
            .ok()
            .and_then(|v| v.target())
        } else {
          None
        }
      })
      .or_else(|| repo.head().ok().and_then(|v| v.target()))
      .ok_or_else(|| {
        error(
          "git_invalid_input",
          "Cannot find the original operation HEAD",
        )
      })?;
    let target = repo.find_object(original, None)?;
    repo.reset(
      &target,
      git2::ResetType::Hard,
      Some(git2::build::CheckoutBuilder::new().force()),
    )?;
    repo.cleanup_state()?;
    return Ok(());
  }
  if repo.index()?.has_conflicts() {
    return Err(error(
      "git_conflicts_present",
      "Stage all resolved conflicts before continuing",
    ));
  }
  let todo = metadata(repo, "sequencer/todo")?;
  let message = repo.message().unwrap_or_else(|_| {
    if operation == "merge" {
      "Merge".into()
    } else {
      format!("Continue {operation}")
    }
  });
  if operation == "merge" {
    super::local::commit_now(repo, &message, true)?;
    return Ok(());
  }
  let original = metadata(repo, "sequencer/head")?;
  let options = metadata(repo, "sequencer/opts")?;
  let mainline = if options.is_some() {
    git2::Config::open(&repo.path().join("sequencer/opts"))?
      .get_i32("options.mainline")
      .ok()
      .map(|v| v as u32)
  } else {
    None
  };
  if let Some(todo) = &todo {
    super::sequencer::validate(repo, todo)?;
  }
  finish_simple(repo, &message)?;
  if let Some(todo) = todo {
    super::sequencer::continue_remaining(
      repo,
      &todo,
      original.as_deref(),
      options.as_deref(),
      mainline,
    )?;
  }
  Ok(())
}
fn metadata(repo: &git2::Repository, name: &str) -> BackendResult<Option<String>> {
  use std::io::Read;
  let path = repo.path().join(name);
  if let Some(parent) = path.parent() {
    match std::fs::symlink_metadata(parent) {
      Ok(meta) if meta.file_type().is_symlink() || !meta.is_dir() => {
        return Err(error(
          "git_workspace_boundary",
          "Unsafe Git operation metadata directory",
        ));
      }
      Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
      Err(e) => return Err(e.into()),
      _ => (),
    }
  }
  let mut options = std::fs::OpenOptions::new();
  options.read(true);
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    options.custom_flags(libc::O_NOFOLLOW);
  }
  match options.open(path) {
    Ok(file) => {
      let mut text = String::new();
      file.take(1024 * 1024 + 1).read_to_string(&mut text)?;
      if text.len() > 1024 * 1024 {
        return Err(error(
          "git_invalid_input",
          "Git sequencer metadata exceeds the safe limit",
        ));
      }
      Ok(Some(text))
    }
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
    Err(e) => Err(e.into()),
  }
}

pub async fn sequence(root: &std::path::Path, abort: bool) -> BackendResult<super::types::Status> {
  process::repository(root, move |repo| {
    super::sequence::sequence_now(repo, abort)?;
    status::status_now(repo)
  })
  .await
}
