//! Host-independent, bounded loading of local document images. Remote URLs are never fetched.
use crate::error::{BackendError, BackendResult};
use pulldown_cmark::{Event, Options, Parser, Tag};
use std::{
  collections::{BTreeMap, BTreeSet},
  fs::File,
  io::Read,
  path::Path,
};

pub const MAX_IMAGE_BYTES: usize = 15 * 1024 * 1024;
pub const MAX_TOTAL_IMAGE_BYTES: usize = 100 * 1024 * 1024;
pub const MAX_IMAGES: usize = 50;

pub fn image_urls(markdown: &str) -> Vec<String> {
  let mut urls = BTreeSet::new();
  for event in Parser::new_ext(markdown, Options::ENABLE_TABLES | Options::ENABLE_FOOTNOTES) {
    if let Event::Start(Tag::Image { dest_url, .. }) = event {
      urls.insert(dest_url.into_string());
    }
    if urls.len() >= MAX_IMAGES {
      break;
    }
  }
  urls.into_iter().collect()
}

pub fn load(
  root: &Path,
  source: &Path,
  urls: Vec<String>,
) -> BackendResult<BTreeMap<String, Vec<u8>>> {
  let source = source.canonicalize()?;
  let root = root.canonicalize()?;
  if !source.starts_with(&root) {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Source is outside the resource root",
    ));
  }
  let parent = source
    .parent()
    .ok_or_else(|| BackendError::new("INVALID_PATH", "Document has no parent"))?;
  load_from_parent(&root, parent, urls)
}

pub fn load_from_parent(
  root: &Path,
  parent: &Path,
  urls: Vec<String>,
) -> BackendResult<BTreeMap<String, Vec<u8>>> {
  let root = root.canonicalize()?;
  let parent = parent.canonicalize()?;
  if !parent.starts_with(&root) {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Image base is outside the resource root",
    ));
  }
  let mut images = BTreeMap::new();
  let mut total = 0;
  for url in urls.into_iter().take(MAX_IMAGES) {
    let raw = url.split(['?', '#']).next().unwrap_or("");
    if raw.is_empty() || raw.contains(':') || raw.contains('\\') || Path::new(raw).is_absolute() {
      continue;
    }
    let base = url::Url::from_directory_path(&parent)
      .map_err(|_| BackendError::new("INVALID_PATH", "Invalid image base"))?;
    let Some(candidate) = base.join(raw).ok().and_then(|url| url.to_file_path().ok()) else {
      continue;
    };
    let Ok(candidate) = candidate.canonicalize() else {
      continue;
    };
    if !candidate.starts_with(&root) {
      return Err(BackendError::new(
        "INVALID_PATH",
        "Local image escapes the resource root",
      ));
    }
    let metadata = std::fs::metadata(&candidate)?;
    if !metadata.is_file() || metadata.len() > MAX_IMAGE_BYTES as u64 {
      continue;
    }
    let file = File::open(candidate)?;
    let mut bytes = Vec::new();
    file
      .take(MAX_IMAGE_BYTES as u64 + 1)
      .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_IMAGE_BYTES {
      return Err(BackendError::new(
        "FILE_TOO_LARGE",
        "Export image grew while reading",
      ));
    }
    total += bytes.len();
    if total > MAX_TOTAL_IMAGE_BYTES {
      return Err(BackendError::new(
        "FILE_TOO_LARGE",
        "Document images exceed 100 MiB",
      ));
    }
    images.insert(url, bytes);
  }
  Ok(images)
}
