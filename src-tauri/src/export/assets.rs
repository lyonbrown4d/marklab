use crate::error::{BackendError, BackendResult};
use crate::workspace::Workspace;
use std::collections::BTreeMap;

pub(super) use marklab_document::assets::image_urls;

pub async fn load(
  workspace: &Workspace,
  source: &str,
  urls: Vec<String>,
) -> BackendResult<BTreeMap<String, Vec<u8>>> {
  let root = workspace.root_directory().to_path_buf();
  let source = root.join(source);
  tokio::task::spawn_blocking(move || marklab_document::assets::load(&root, &source, urls))
    .await
    .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", error.to_string()))?
    .map_err(Into::into)
}
