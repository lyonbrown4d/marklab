#[path = "state_types.rs"]
mod states;
use serde::{Deserialize, Serialize};
pub use states::*;
#[derive(Clone, Default, Serialize, specta::Type)]
pub struct RepoInfo {
  pub is_repository: bool,
  pub workdir: Option<String>,
  pub git_dir: Option<String>,
  pub branch: Option<String>,
  pub head: Option<String>,
}
pub use GitChange as Change;
#[derive(Clone, Serialize, specta::Type)]
pub struct GitChange {
  pub path: String,
  pub old_path: Option<String>,
  pub status: ChangeStatus,
  pub detail: String,
}
pub use GitStatus as Status;
#[derive(Clone, Default, Serialize, specta::Type)]
pub struct GitStatus {
  pub repo: RepoInfo,
  pub staged: Vec<Change>,
  pub unstaged: Vec<Change>,
  pub untracked: Vec<Change>,
  pub conflicts: Vec<Change>,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct FileDiff {
  pub path: String,
  pub old_path: Option<String>,
  pub original_label: String,
  pub modified_label: String,
  pub original_content: String,
  pub modified_content: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub unavailable_reason: Option<UnavailableReason>,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct Commit {
  pub hash: String,
  #[serde(rename = "shortHash")]
  pub short_hash: String,
  pub subject: String,
  pub author: String,
  pub date: String,
  pub parents: Vec<String>,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct Branch {
  pub name: String,
  pub current: bool,
  pub remote: bool,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct Stash {
  pub r#ref: String,
  pub hash: String,
  pub subject: String,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct Operation {
  pub operation: Option<OperationKind>,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct CommitFile {
  pub path: String,
  pub old_path: Option<String>,
  pub status: CommitFileStatus,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct Remote {
  pub name: String,
  pub fetch_url: Option<String>,
  pub push_url: Option<String>,
}
#[derive(Clone, Serialize, specta::Type)]
pub struct RemoteStatus {
  pub remotes: Vec<Remote>,
  pub branch: Option<String>,
  pub upstream: Option<String>,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub ahead: u64,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub behind: u64,
  pub detached: bool,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ResetResult {
  pub status: Status,
  pub backup_branch: String,
}
#[derive(Deserialize, Default, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
  #[serde(default)]
  pub expected_root: Option<String>,
}
macro_rules! request { ($name:ident { $($(#[$attribute:meta])* $field:ident: $ty:ty),* $(,)? }) => {
    #[derive(Deserialize, specta::Type)] #[serde(rename_all="camelCase", deny_unknown_fields)]
    pub struct $name { #[serde(default)] pub expected_root: Option<String>, $($(#[$attribute])* pub $field: $ty),* }
}; }
request!(PathsRequest { paths: Vec<String> });
request!(MessageRequest { message: String });
request!(BranchRequest { name: String, #[serde(default)] start_point: Option<String>, #[serde(default)] force: Option<bool> });
request!(RevisionRequest { commit: String, #[serde(default)] mainline: Option<u32>, #[serde(default)] mode: Option<String> });
request!(HistoryRequest { #[serde(default)] limit: Option<u32>, #[serde(default)] skip: Option<u32> });
request!(StashRequest { r#ref: String, #[serde(default)] expected_hash: Option<String> });
request!(StashSaveRequest { #[serde(default)] message: Option<String> });
request!(DiffRequest {
  path: String,
  section: String
});
request!(CommitDiffRequest { commit: String, path: String, #[serde(default)] old_path: Option<String> });
request!(RemoteRequest { name: String, #[serde(default)] url: Option<String> });
request!(NetworkRequest { #[serde(default)] remote: Option<String>, #[serde(default)] set_upstream: Option<bool> });
request!(PathRequest { path: String });
request!(ConflictSaveRequest { path: String, content: String, revision: String, #[serde(default)] stage: Option<bool>, #[serde(default)] delete_file: Option<bool> });
request!(OpenFileRequest { path: String, #[serde(default)] section: Option<String>, #[serde(default)] commit: Option<String>, #[serde(default)] old_path: Option<String>, action: String });
