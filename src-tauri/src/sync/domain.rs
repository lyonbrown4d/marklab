use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum SyncProvider {
  Webdav,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SyncStage {
  Flushing,
  Scanning,
  ReadingRemote,
  Planning,
  Applying,
  WritingManifest,
  Invalidating,
  Completed,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ConflictStatus {
  Unresolved,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ConflictReason {
  BothChanged,
  DeleteVsChange,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum SkipReason {
  FileTooLarge,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum ConflictUnavailable {
  Deleted,
  TooLarge,
  Binary,
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ConflictChoice {
  Local,
  Remote,
}
