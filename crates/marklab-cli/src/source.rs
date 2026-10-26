use crate::Result;
use marklab_document::{SourceDocument, assets};
use std::{
  fs::File,
  io::{self, Read},
  path::Path,
};
use tokio_util::sync::CancellationToken;

pub const MAX_TEXT: usize = 64 * 1024 * 1024;

pub fn text(reader: impl Read) -> Result<String> {
  let mut bytes = Vec::new();
  reader.take(MAX_TEXT as u64 + 1).read_to_end(&mut bytes)?;
  if bytes.len() > MAX_TEXT {
    return Err("Document exceeds the 64 MiB text limit".into());
  }
  Ok(String::from_utf8(bytes)?)
}

pub fn title(path: &Path) -> String {
  path
    .file_stem()
    .map(|part| part.to_string_lossy().into_owned())
    .filter(|part| !part.trim().is_empty())
    .unwrap_or_else(|| "Document".into())
}

pub fn file(
  path: &Path,
  root: &Path,
  title: String,
  include_linked: bool,
  locale: &str,
  cancelled: &CancellationToken,
) -> Result<SourceDocument> {
  let metadata = std::fs::symlink_metadata(path)?;
  if metadata.file_type().is_symlink() {
    return Err(format!("Symlink sources are not followed: {}", path.display()).into());
  }
  if !metadata.is_file() {
    return Err(format!("Input must be a regular file: {}", path.display()).into());
  }
  let canonical = path.canonicalize()?;
  let root = root.canonicalize()?;
  if !canonical.starts_with(&root) {
    return Err(format!("Source is outside the resource root: {}", path.display()).into());
  }
  let markdown = text(File::open(&canonical)?)?;
  let markdown = marklab_document::imports::prepare(
    &root,
    canonical.parent().ok_or("Input has no parent")?,
    &markdown,
    include_linked,
    locale,
    cancelled,
  )?;
  let images = assets::load(&root, &canonical, assets::image_urls(&markdown))?;
  Ok(SourceDocument {
    path: canonical.to_string_lossy().into_owned(),
    title,
    markdown,
    assets: images,
  })
}

pub fn stdin_text(cancelled: &CancellationToken) -> Result<String> {
  // An OS reader avoids keeping Tokio's blocking pool alive after Ctrl-C when
  // an upstream pipe remains open without providing data.
  let (sender, receiver) = std::sync::mpsc::sync_channel(1);
  std::thread::spawn(move || {
    let _ = sender.send(text(io::stdin().lock()));
  });
  loop {
    marklab_document::check_cancelled(cancelled)?;
    match receiver.recv_timeout(std::time::Duration::from_millis(50)) {
      Ok(result) => return result,
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
      Err(error) => return Err(error.into()),
    }
  }
}

pub fn stdin(
  root: Option<&Path>,
  include_linked: bool,
  locale: &str,
  cancelled: &CancellationToken,
) -> Result<SourceDocument> {
  let markdown = stdin_text(cancelled)?;
  let markdown = if marklab_document::imports::has_imports(&markdown, include_linked) {
    let root = root.ok_or("Spreadsheet imports from stdin require --resource-root")?;
    marklab_document::imports::prepare(root, root, &markdown, include_linked, locale, cancelled)?
  } else {
    markdown
  };
  let urls = assets::image_urls(&markdown);
  let images = if urls.is_empty() {
    Default::default()
  } else {
    let root = root.ok_or("Images from stdin require --resource-root")?;
    assets::load_from_parent(root, root, urls)?
  };
  Ok(SourceDocument {
    path: "stdin.md".into(),
    title: "Document".into(),
    markdown,
    assets: images,
  })
}
