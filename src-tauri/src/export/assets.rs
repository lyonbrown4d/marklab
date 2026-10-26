use crate::error::{BackendError, BackendResult};
use crate::workspace::Workspace;
use std::collections::BTreeMap;

pub(super) use marklab_document::assets::image_urls;

pub async fn prepare(
  workspace: &Workspace,
  source: &str,
  markdown: String,
  include_linked: bool,
  locale: String,
  cancelled: tokio_util::sync::CancellationToken,
) -> BackendResult<(String, BTreeMap<String, Vec<u8>>)> {
  let root = workspace.root_directory().to_path_buf();
  let source = root.join(source);
  tokio::task::spawn_blocking(move || {
    let source = source.canonicalize()?;
    let root = root.canonicalize()?;
    if !source.starts_with(&root) {
      return Err(marklab_document::error::BackendError::new(
        "INVALID_PATH",
        "Source is outside the resource root",
      ));
    }
    let parent = source.parent().ok_or_else(|| {
      marklab_document::error::BackendError::new("INVALID_PATH", "Source has no parent")
    })?;
    let markdown = marklab_document::imports::prepare(
      &root,
      parent,
      &markdown,
      include_linked,
      &locale,
      &cancelled,
    )?;
    let assets = marklab_document::assets::load(&root, &source, image_urls(&markdown))?;
    Ok((markdown, assets))
  })
  .await
  .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", error.to_string()))?
  .map_err(Into::into)
}
