use serde::Serialize;
use std::ops::Deref;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
  Added,
  Modified,
  Deleted,
  Renamed,
  Copied,
  Conflicted,
  Untracked,
  Ignored,
  Tracked,
  Pruned,
}
impl ChangeStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Added => "added",
      Self::Modified => "modified",
      Self::Deleted => "deleted",
      Self::Renamed => "renamed",
      Self::Copied => "copied",
      Self::Conflicted => "conflicted",
      Self::Untracked => "untracked",
      Self::Ignored => "ignored",
      Self::Tracked => "tracked",
      Self::Pruned => "pruned",
    }
  }
}
impl Deref for ChangeStatus {
  type Target = str;
  fn deref(&self) -> &str {
    self.as_str()
  }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
pub enum CommitFileStatus {
  A,
  D,
  R,
  C,
  T,
  M,
}
impl Deref for CommitFileStatus {
  type Target = str;
  fn deref(&self) -> &str {
    match self {
      Self::A => "A",
      Self::D => "D",
      Self::R => "R",
      Self::C => "C",
      Self::T => "T",
      Self::M => "M",
    }
  }
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum OperationKind {
  Merge,
  Rebase,
  Revert,
  CherryPick,
}
impl OperationKind {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Merge => "merge",
      Self::Rebase => "rebase",
      Self::Revert => "revert",
      Self::CherryPick => "cherry-pick",
    }
  }
}
impl Deref for OperationKind {
  type Target = str;
  fn deref(&self) -> &str {
    self.as_str()
  }
}

impl std::fmt::Display for OperationKind {
  fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    formatter.write_str(self.as_str())
  }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum UnavailableReason {
  Binary,
  UnsupportedEncoding,
  TooLarge,
}
impl UnavailableReason {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Binary => "binary",
      Self::UnsupportedEncoding => "unsupported_encoding",
      Self::TooLarge => "too_large",
    }
  }
}
