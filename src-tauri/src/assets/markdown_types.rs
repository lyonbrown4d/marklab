use serde::{Deserialize, Serialize};

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ImportRequest {
  pub(super) source_path: String,
  pub(super) document_path: String,
  pub(super) strategy: String,
  #[serde(default)]
  pub(super) title: Option<String>,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BytesRequest {
  pub(super) file_name: String,
  pub(super) bytes: Vec<u8>,
  pub(super) document_path: String,
  #[serde(default)]
  pub(super) title: Option<String>,
}
#[derive(Serialize, specta::Type)]
pub struct ImportResult {
  pub(super) markdown_target: String,
  pub(super) relative_path: Option<String>,
  pub(super) asset_dir: Option<String>,
  pub(super) copied: bool,
}

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResolveRequest {
  pub(super) document_path: String,
  pub(super) target: String,
}
#[derive(Serialize, specta::Type)]
pub struct ResolveResult {
  pub(super) source_path: String,
  pub(super) target: String,
  pub(super) relative_path: Option<String>,
  pub(super) is_external: bool,
  pub(super) media_type: Option<String>,
  pub(super) exists: bool,
}
