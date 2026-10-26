//! Expand explicitly embedded local spreadsheets into the common Markdown rendering path.
mod discovery;
mod table;
#[cfg(test)]
mod tests;
use crate::{
  check_cancelled,
  error::{BackendError, BackendResult},
  spreadsheet,
};
use std::{
  collections::{BTreeMap, BTreeSet},
  fs::File,
  io::Read,
  path::Path,
};
use tokio_util::sync::CancellationToken;

pub fn has_imports(markdown: &str, include_linked: bool) -> bool {
  !discovery::find(markdown, include_linked).is_empty()
}

pub fn prepare(
  root: &Path,
  parent: &Path,
  markdown: &str,
  include_linked: bool,
  locale: &str,
  cancelled: &CancellationToken,
) -> BackendResult<String> {
  let imports = discovery::find(markdown, include_linked);
  if imports.is_empty() {
    return Ok(markdown.into());
  }
  if imports.len() > 32 {
    return Err(BackendError::new(
      "SPREADSHEET_LIMIT",
      "Document exceeds 32 spreadsheet imports",
    ));
  }
  let root = root.canonicalize()?;
  let parent = parent.canonicalize()?;
  if !parent.starts_with(&root) {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Spreadsheet base is outside the resource root",
    ));
  }
  let mut cache = BTreeMap::new();
  let mut output = String::new();
  let mut appendix = String::new();
  let mut appended = BTreeSet::new();
  let mut offset = 0;
  let mut total = 0;
  for import in imports {
    check_cancelled(cancelled)?;
    let raw = import.url.split(['?', '#']).next().unwrap_or("");
    if raw.is_empty() || raw.contains(':') || raw.contains('\\') || raw.starts_with('/') {
      return Err(BackendError::new(
        "INVALID_PATH",
        "Spreadsheet embeds require a local relative path; remote files are not fetched",
      ));
    }
    let base = url::Url::from_directory_path(&parent)
      .map_err(|_| BackendError::new("INVALID_PATH", "Invalid spreadsheet base"))?;
    let candidate = base
      .join(raw)
      .ok()
      .and_then(|url| url.to_file_path().ok())
      .ok_or_else(|| BackendError::new("INVALID_PATH", "Invalid spreadsheet path"))?;
    let candidate = candidate.canonicalize().map_err(|error| {
      BackendError::new(
        "SPREADSHEET_IMPORT_FAILED",
        format!("Cannot open embedded spreadsheet {}: {error}", import.url),
      )
    })?;
    if !candidate.starts_with(&root) {
      return Err(BackendError::new(
        "INVALID_PATH",
        "Spreadsheet escapes the resource root",
      ));
    }
    let section = if let Some(section) = cache.get(&candidate) {
      section
    } else {
      let metadata = std::fs::metadata(&candidate)?;
      if !metadata.is_file() || metadata.len() > spreadsheet::MAX_FILE_BYTES {
        return Err(BackendError::new(
          "SPREADSHEET_LIMIT",
          "Spreadsheet must be a regular file of at most 16 MiB",
        ));
      }
      let file = File::open(&candidate)?;
      let before = file.metadata()?;
      if !before.is_file() || before.len() > spreadsheet::MAX_FILE_BYTES {
        return Err(BackendError::new(
          "SPREADSHEET_LIMIT",
          "Spreadsheet must be a regular file of at most 16 MiB",
        ));
      }
      let mut bytes = Vec::new();
      (&file)
        .take(spreadsheet::MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)?;
      let after = file.metadata()?;
      if before.len() != after.len() || before.modified()? != after.modified()? {
        return Err(BackendError::new(
          "SPREADSHEET_IMPORT_FAILED",
          "Spreadsheet changed during export; try again",
        ));
      }
      total += bytes.len();
      if total > 64 * 1024 * 1024 {
        return Err(BackendError::new(
          "SPREADSHEET_LIMIT",
          "Spreadsheet imports exceed 64 MiB",
        ));
      }
      if bytes.starts_with(b"version https://git-lfs.github.com/spec/") {
        return Err(BackendError::new(
          "SPREADSHEET_IMPORT_FAILED",
          "Spreadsheet is a Git LFS pointer; download the workbook before exporting",
        ));
      }
      let sheets = spreadsheet::read(bytes, &discovery::extension(&import.url), cancelled)?;
      let title = if import.title.trim().is_empty() {
        candidate
          .file_name()
          .and_then(|name| name.to_str())
          .unwrap_or("Spreadsheet")
      } else {
        &import.title
      };
      let section = table::render(title, &sheets, locale);
      cache.insert(candidate.clone(), section);
      cache.get(&candidate).ok_or_else(|| {
        BackendError::new(
          "SPREADSHEET_IMPORT_FAILED",
          "Spreadsheet output unavailable",
        )
      })?
    };
    if output
      .len()
      .saturating_add(appendix.len())
      .saturating_add(section.len())
      > 64 * 1024 * 1024
    {
      return Err(BackendError::new(
        "SPREADSHEET_LIMIT",
        "Expanded document exceeds 64 MiB",
      ));
    }
    output.push_str(&markdown[offset..import.range.start]);
    if import.appendix {
      let original = &markdown[import.range.clone()];
      if original.starts_with('!') {
        output.push_str(if locale == "zh-CN" {
          "电子表格附件"
        } else {
          "Spreadsheet attachment"
        });
      } else {
        output.push_str(original);
      }
      if appended.insert(candidate) {
        appendix.push_str(section);
      }
    } else {
      output.push_str(section);
    }
    offset = import.range.end;
  }
  output.push_str(&markdown[offset..]);
  output.push_str(&appendix);
  if output.len() > 64 * 1024 * 1024 {
    return Err(BackendError::new(
      "SPREADSHEET_LIMIT",
      "Expanded document exceeds 64 MiB",
    ));
  }
  Ok(output)
}
