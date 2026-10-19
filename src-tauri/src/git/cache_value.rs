use super::*;
#[derive(Clone)]
pub enum Value {
  Repository(RepoInfo),
  Status(Status),
  Diff(FileDiff),
  History(Vec<Commit>),
  Branches(Vec<Branch>),
  Stashes(Vec<Stash>),
  Operation(Operation),
  Conflict(conflict::ConflictPreview),
  CommitFiles(Vec<CommitFile>),
  Remote(RemoteStatus),
}
impl Value {
  pub fn weight(&self) -> u32 {
    let optional = |value: &Option<String>| value.as_ref().map_or(0, String::len);
    let repo = |value: &RepoInfo| {
      optional(&value.workdir)
        + optional(&value.git_dir)
        + optional(&value.branch)
        + optional(&value.head)
    };
    let changes = |values: &[Change]| {
      values
        .iter()
        .map(|value| {
          value.path.len()
            + optional(&value.old_path)
            + value.status.len()
            + value.detail.len()
            + 128
        })
        .sum::<usize>()
    };
    let length = match self {
      Self::Repository(value) => repo(value),
      Self::Status(value) => {
        repo(&value.repo)
          + changes(&value.staged)
          + changes(&value.unstaged)
          + changes(&value.untracked)
          + changes(&value.conflicts)
      }
      Self::Diff(value) => {
        value.original_content.len()
          + value.modified_content.len()
          + value.path.len()
          + optional(&value.old_path)
          + value.original_label.len()
          + value.modified_label.len()
          + optional(&value.unavailable_reason)
      }
      Self::History(values) => values
        .iter()
        .map(|value| {
          value.hash.len()
            + value.short_hash.len()
            + value.subject.len()
            + value.author.len()
            + value.date.len()
            + value.parents.iter().map(String::len).sum::<usize>()
            + 256
        })
        .sum(),
      Self::Branches(values) => values.iter().map(|value| value.name.len() + 64).sum(),
      Self::Stashes(values) => values
        .iter()
        .map(|value| value.r#ref.len() + value.hash.len() + value.subject.len() + 128)
        .sum(),
      Self::Operation(value) => optional(&value.operation),
      Self::Conflict(conflict::ConflictPreview::Text(value)) => {
        value.path.len()
          + optional(&value.base)
          + optional(&value.ours)
          + optional(&value.theirs)
          + value.result.len()
          + value.revision.len()
      }
      Self::Conflict(conflict::ConflictPreview::Unavailable {
        path,
        unavailable_reason,
      }) => path.len() + unavailable_reason.len(),
      Self::CommitFiles(values) => values
        .iter()
        .map(|value| value.path.len() + optional(&value.old_path) + value.status.len() + 96)
        .sum(),
      Self::Remote(value) => {
        value
          .remotes
          .iter()
          .map(|remote| {
            remote.name.len() + optional(&remote.fetch_url) + optional(&remote.push_url) + 128
          })
          .sum::<usize>()
          + optional(&value.branch)
          + optional(&value.upstream)
      }
    };
    u32::try_from(length.saturating_add(256)).unwrap_or(u32::MAX)
  }
}
