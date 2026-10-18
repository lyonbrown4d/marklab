use serde::{Deserialize, Serialize};
#[derive(Clone, Default, Serialize)]
pub struct RepoInfo {
    pub is_repository: bool,
    pub workdir: Option<String>,
    pub git_dir: Option<String>,
    pub branch: Option<String>,
    pub head: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct Change {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub detail: String,
}
#[derive(Clone, Default, Serialize)]
pub struct Status {
    pub repo: RepoInfo,
    pub staged: Vec<Change>,
    pub unstaged: Vec<Change>,
    pub untracked: Vec<Change>,
    pub conflicts: Vec<Change>,
}
#[derive(Clone, Serialize)]
pub struct FileDiff {
    pub path: String,
    pub old_path: Option<String>,
    pub original_label: String,
    pub modified_label: String,
    pub original_content: String,
    pub modified_content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unavailable_reason: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct Commit {
    pub hash: String,
    #[serde(rename = "shortHash")]
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub parents: Vec<String>,
}
#[derive(Clone, Serialize)]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub remote: bool,
}
#[derive(Clone, Serialize)]
pub struct Stash {
    pub r#ref: String,
    pub hash: String,
    pub subject: String,
}
#[derive(Clone, Serialize)]
pub struct Operation {
    pub operation: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct CommitFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: String,
}
#[derive(Clone, Serialize)]
pub struct Remote {
    pub name: String,
    pub fetch_url: Option<String>,
    pub push_url: Option<String>,
}
#[derive(Clone, Serialize)]
pub struct RemoteStatus {
    pub remotes: Vec<Remote>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: u64,
    pub behind: u64,
    pub detached: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetResult {
    pub status: Status,
    pub backup_branch: String,
}
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub expected_root: Option<String>,
}
macro_rules! request { ($name:ident { $($field:ident: $ty:ty),* $(,)? }) => {
    #[derive(Deserialize)] #[serde(rename_all="camelCase", deny_unknown_fields)]
    pub struct $name { pub expected_root: Option<String>, $(pub $field: $ty),* }
}; }
request!(PathsRequest { paths: Vec<String> });
request!(MessageRequest { message: String });
request!(BranchRequest { name: String, start_point: Option<String>, force: Option<bool> });
request!(RevisionRequest { commit: String, mainline: Option<u32>, mode: Option<String> });
request!(HistoryRequest { limit: Option<u32>, skip: Option<u32> });
request!(StashRequest { r#ref: String, expected_hash: Option<String> });
request!(StashSaveRequest { message: Option<String> });
request!(DiffRequest {
    path: String,
    section: String
});
request!(CommitDiffRequest { commit: String, path: String, old_path: Option<String> });
request!(RemoteRequest { name: String, url: Option<String> });
request!(NetworkRequest { remote: Option<String>, set_upstream: Option<bool> });
request!(PathRequest { path: String });
request!(ConflictSaveRequest { path: String, content: String, revision: String, stage: Option<bool>, delete_file: Option<bool> });
request!(OpenFileRequest { path: String, section: Option<String>, commit: Option<String>, old_path: Option<String>, action: String });
