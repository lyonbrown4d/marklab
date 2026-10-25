use crate::{Result, args::Filters};
use globset::{Glob, GlobSet, GlobSetBuilder};
use std::{
  cmp::Ordering,
  collections::BTreeSet,
  fs,
  io::Write,
  path::{Component, Path, PathBuf},
};
use tokio_util::sync::CancellationToken;

pub struct Selection {
  include: GlobSet,
  exclude: GlobSet,
}

impl Selection {
  pub fn new(filters: &Filters) -> Result<Self> {
    let build = |values: &[String]| -> Result<GlobSet> {
      let mut builder = GlobSetBuilder::new();
      for value in values {
        builder.add(Glob::new(value)?);
      }
      Ok(builder.build()?)
    };
    Ok(Self {
      include: build(&filters.include)?,
      exclude: build(&filters.exclude)?,
    })
  }
  pub fn accepts(&self, relative: &Path) -> bool {
    (self.include.is_empty() || self.include.is_match(relative)) && !self.exclude.is_match(relative)
  }
}

pub fn absolute(path: &Path) -> Result<PathBuf> {
  let path = if path.is_absolute() {
    path.to_path_buf()
  } else {
    std::env::current_dir()?.join(path)
  };
  let mut normalized = PathBuf::new();
  for part in path.components() {
    match part {
      Component::CurDir => {}
      Component::ParentDir => {
        normalized.pop();
      }
      _ => normalized.push(part),
    }
  }
  if fs::symlink_metadata(&normalized).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
    return Err(format!("Symlink output is not followed: {}", normalized.display()).into());
  }
  let mut ancestor = normalized.as_path();
  let mut tail = Vec::new();
  while !ancestor.exists() {
    tail.push(
      ancestor
        .file_name()
        .ok_or("Invalid output path")?
        .to_os_string(),
    );
    ancestor = ancestor.parent().ok_or("Invalid output path")?;
  }
  let mut resolved = fs::canonicalize(ancestor)?;
  for part in tail.into_iter().rev() {
    resolved.push(part);
  }
  Ok(resolved)
}

pub fn discover(
  root: &Path,
  recursive: bool,
  selection: &Selection,
  output: Option<&Path>,
  cancel: &CancellationToken,
) -> Result<Vec<PathBuf>> {
  let mut pending = vec![root.to_path_buf()];
  let mut files = Vec::new();
  while let Some(directory) = pending.pop() {
    marklab_document::check_cancelled(cancel)?;
    for entry in fs::read_dir(directory)? {
      marklab_document::check_cancelled(cancel)?;
      let entry = entry?;
      let path = entry.path();
      if output.is_some_and(|output| output.starts_with(root) && path.starts_with(output)) {
        continue;
      }
      let kind = entry.file_type()?;
      if kind.is_symlink() {
        continue;
      }
      if kind.is_dir() && recursive {
        if matches!(
          entry.file_name().to_str(),
          Some(
            ".git"
              | "node_modules"
              | ".venv"
              | "venv"
              | ".tox"
              | "__pycache__"
              | "target"
              | "build"
              | "dist"
          )
        ) {
          continue;
        }
        pending.push(path);
      } else if kind.is_file() && markdown(&path) && selection.accepts(path.strip_prefix(root)?) {
        files.push(path);
      }
    }
  }
  files.sort_by(|a, b| natural(&a.to_string_lossy(), &b.to_string_lossy()));
  if files.is_empty() {
    return Err("No Markdown documents matched the input".into());
  }
  Ok(files)
}

pub fn markdown(path: &Path) -> bool {
  path
    .extension()
    .and_then(|part| part.to_str())
    .is_some_and(|part| part.eq_ignore_ascii_case("md") || part.eq_ignore_ascii_case("markdown"))
}

fn natural(a: &str, b: &str) -> Ordering {
  let (a, b) = (a.as_bytes(), b.as_bytes());
  let (mut i, mut j) = (0, 0);
  while i < a.len() && j < b.len() {
    if a[i].is_ascii_digit() && b[j].is_ascii_digit() {
      let (ai, bj) = (i, j);
      while i < a.len() && a[i].is_ascii_digit() {
        i += 1;
      }
      while j < b.len() && b[j].is_ascii_digit() {
        j += 1;
      }
      let aa = &a[ai..i];
      let bb = &b[bj..j];
      let aa = aa
        .iter()
        .position(|c| *c != b'0')
        .map_or(&aa[aa.len()..], |p| &aa[p..]);
      let bb = bb
        .iter()
        .position(|c| *c != b'0')
        .map_or(&bb[bb.len()..], |p| &bb[p..]);
      let order = aa.len().cmp(&bb.len()).then_with(|| aa.cmp(bb));
      if order != Ordering::Equal {
        return order;
      }
    } else {
      let order = a[i].cmp(&b[j]);
      if order != Ordering::Equal {
        return order;
      }
      i += 1;
      j += 1;
    }
  }
  a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

pub fn preflight(sources: &[PathBuf], outputs: &[PathBuf], overwrite: bool) -> Result<()> {
  let sources: BTreeSet<_> = sources
    .iter()
    .map(|path| path.to_string_lossy().to_lowercase())
    .collect();
  let mut seen = BTreeSet::new();
  let planned: BTreeSet<_> = outputs
    .iter()
    .map(|path| path.to_string_lossy().to_lowercase())
    .collect();
  let exact: BTreeSet<_> = outputs.iter().cloned().collect();
  let mut checked_parents = BTreeSet::new();
  for output in outputs {
    let Some(parent) = output.parent() else {
      continue;
    };
    if !parent.is_dir() || !checked_parents.insert(parent.to_path_buf()) {
      continue;
    }
    for entry in fs::read_dir(parent)? {
      let entry = entry?;
      let existing = entry.path();
      let folded = existing.to_string_lossy().to_lowercase();
      if planned.contains(&folded) && !exact.contains(&existing) {
        return Err(
          format!(
            "Output conflicts with existing filename case: {}",
            existing.display()
          )
          .into(),
        );
      }
    }
  }
  for output in outputs {
    let key = output.to_string_lossy().to_lowercase();
    if sources.contains(&key) {
      return Err(format!("Output would overwrite a source: {}", output.display()).into());
    }
    if !seen.insert(key) {
      return Err(format!("Output name collision: {}", output.display()).into());
    }
    if let Ok(metadata) = fs::symlink_metadata(output) {
      if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!("Output must be a regular file: {}", output.display()).into());
      }
      if !overwrite {
        return Err(
          format!(
            "Output already exists (use --overwrite): {}",
            output.display()
          )
          .into(),
        );
      }
    }
    let mut ancestor = output.parent();
    while let Some(path) = ancestor {
      if planned.contains(&path.to_string_lossy().to_lowercase()) {
        return Err(
          format!(
            "Output path conflicts with another output: {}",
            path.display()
          )
          .into(),
        );
      }
      if fs::symlink_metadata(path).is_ok_and(|metadata| metadata.file_type().is_symlink()) {
        return Err(format!("Symlink output parent is not followed: {}", path.display()).into());
      }
      if path.exists() && !path.is_dir() {
        return Err(format!("Output parent is not a directory: {}", path.display()).into());
      }
      ancestor = path.parent();
    }
  }
  Ok(())
}

pub fn write(
  output: &Path,
  bytes: &[u8],
  overwrite: bool,
  cancel: &CancellationToken,
) -> Result<()> {
  let parent = output
    .parent()
    .ok_or("Output requires a parent directory")?;
  fs::create_dir_all(parent)?;
  let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
  temporary.write_all(bytes)?;
  temporary.as_file().sync_all()?;
  marklab_document::check_cancelled(cancel)?;
  if overwrite {
    temporary.persist(output).map_err(|error| error.error)?;
  } else {
    temporary
      .persist_noclobber(output)
      .map_err(|error| error.error)?;
  }
  Ok(())
}
