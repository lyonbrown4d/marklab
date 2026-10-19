use super::{
  process::{self, error},
  safety,
  types::*,
};
use crate::error::BackendResult;
use std::path::Path;
pub async fn history(root: &Path, request: &HistoryRequest) -> BackendResult<Vec<Commit>> {
  let limit = request.limit.unwrap_or(50);
  let skip = request.skip.unwrap_or(0);
  if !(1..=200).contains(&limit) || skip > 100000 {
    return Err(error("git_invalid_input", "Invalid history pagination"));
  }
  process::repository(root, move |repo| {
    if repo.head().is_err() {
      return Ok(vec![]);
    }
    let mut walk = repo.revwalk()?;
    walk.set_sorting(git2::Sort::TOPOLOGICAL | git2::Sort::TIME)?;
    walk.push_head()?;
    walk
      .skip(skip as usize)
      .take(limit as usize)
      .map(|oid| {
        let commit = repo.find_commit(oid?)?;
        let hash = commit.id().to_string();
        let time = commit.time();
        let date = chrono::DateTime::from_timestamp(time.seconds(), 0)
          .map(
            |value| match chrono::FixedOffset::east_opt(time.offset_minutes() * 60) {
              Some(offset) => value.with_timezone(&offset).to_rfc3339(),
              None => value.to_rfc3339(),
            },
          )
          .unwrap_or_default();
        Ok(Commit {
          short_hash: hash.chars().take(7).collect(),
          hash,
          subject: commit.summary()?.unwrap_or("").into(),
          author: commit.author().name().unwrap_or("").into(),
          date,
          parents: commit.parent_ids().map(|v| v.to_string()).collect(),
        })
      })
      .collect()
  })
  .await
}
pub async fn branches(root: &Path) -> BackendResult<Vec<Branch>> {
  process::repository(root, |repo| {
    repo
      .branches(None)?
      .map(|entry| {
        let (branch, kind) = entry?;
        Ok(Branch {
          name: branch
            .name()?
            .ok_or_else(|| error("git_invalid_input", "Branch names must be UTF-8"))?
            .into(),
          current: branch.is_head(),
          remote: kind == git2::BranchType::Remote,
        })
      })
      .collect()
  })
  .await
}
pub fn stashes_now(repo: &mut git2::Repository) -> BackendResult<Vec<Stash>> {
  let mut result = Vec::new();
  repo.stash_foreach(|index, message, hash| {
    result.push(Stash {
      r#ref: format!("stash@{{{index}}}"),
      hash: hash.to_string(),
      subject: message.into(),
    });
    true
  })?;
  Ok(result)
}
pub async fn stashes(root: &Path) -> BackendResult<Vec<Stash>> {
  process::repository(root, stashes_now).await
}
pub fn require_stash_now(
  repo: &mut git2::Repository,
  reference: &str,
  expected: Option<&str>,
) -> BackendResult<(usize, Stash)> {
  let index = reference
    .strip_prefix("stash@{")
    .and_then(|v| v.strip_suffix('}'))
    .and_then(|v| v.parse::<usize>().ok())
    .ok_or_else(|| error("git_invalid_input", "Invalid stash reference"))?;
  let entry = stashes_now(repo)?.into_iter().nth(index).ok_or_else(|| {
    error(
      "git_invalid_input",
      "Stash entry does not exist; refresh the stash list",
    )
  })?;
  if let Some(expected) = expected {
    safety::hash(expected)?;
    if !entry.hash.eq_ignore_ascii_case(expected) {
      return Err(error(
        "git_invalid_input",
        "Stash entry changed; refresh the stash list",
      ));
    }
  }
  Ok((index, entry))
}
pub async fn commit_files(root: &Path, revision: &str) -> BackendResult<Vec<CommitFile>> {
  let revision = revision.to_owned();
  process::repository(root, move |repo| commit_files_now(repo, &revision)).await
}
pub fn commit_files_now(repo: &git2::Repository, revision: &str) -> BackendResult<Vec<CommitFile>> {
  let commit = safety::commit_now(repo, revision)?;
  let tree = commit.tree()?;
  let parent = if commit.parent_count() > 0 {
    Some(commit.parent(0)?.tree()?)
  } else {
    None
  };
  let mut diff = repo.diff_tree_to_tree(parent.as_ref(), Some(&tree), None)?;
  diff.find_similar(None)?;
  diff
    .deltas()
    .map(|delta| {
      let path = delta
        .new_file()
        .path()
        .or_else(|| delta.old_file().path())
        .ok_or_else(|| error("git_invalid_input", "Invalid changed path"))?
        .to_str()
        .ok_or_else(|| error("git_invalid_input", "Git paths must be UTF-8"))?
        .into();
      let old_path = if matches!(delta.status(), git2::Delta::Renamed | git2::Delta::Copied) {
        delta
          .old_file()
          .path()
          .map(|v| v.to_string_lossy().into_owned())
      } else {
        None
      };
      let status = match delta.status() {
        git2::Delta::Added => "A",
        git2::Delta::Deleted => "D",
        git2::Delta::Renamed => "R",
        git2::Delta::Copied => "C",
        git2::Delta::Typechange => "T",
        _ => "M",
      }
      .into();
      Ok(CommitFile {
        path,
        old_path,
        status,
      })
    })
    .collect()
}
