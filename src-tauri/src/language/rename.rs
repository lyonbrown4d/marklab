use super::markdown_types::RenameResult;
use super::{
  types::{Change, MarkdownRequest, Position, Range},
  utf16,
};
use crate::{
  analysis::{Index, document},
  error::{BackendError, BackendResult},
};
use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Edit {
  pub path: String,
  pub line: usize,
  pub start_column: usize,
  pub end_column: usize,
  pub new_text: String,
}
pub struct RenamePlan {
  pub result: RenameResult,
  pub source: Option<Source>,
  pub external: Vec<External>,
}
pub struct Source {
  pub path: String,
  pub content: String,
}
pub struct External {
  pub path: String,
  pub before: String,
  pub after: String,
  pub edit_count: usize,
}

// Frontend flushes its editor into the authoritative buffer before requesting
// rename. Recheck after taking the binding guard; another owner may have edited
// the source while the index/plan was being prepared.
pub(super) async fn validate_source(
  workspace: &crate::workspace::Workspace,
  source: Option<&Source>,
) -> BackendResult<()> {
  if let Some(source) = source
    && workspace.open_file_under_lock(&source.path).await? != source.content
  {
    return Err(BackendError::new(
      "EDIT_CONFLICT",
      "The source document changed while preparing the rename",
    ));
  }
  Ok(())
}

// The command holds the current window's validated workspace mutation guard.
pub(super) async fn validate_external(
  workspace: &crate::workspace::Workspace,
  edits: &[External],
) -> BackendResult<()> {
  for edit in edits {
    if workspace.open_file_under_lock(&edit.path).await? != edit.before {
      return Err(BackendError::new(
        "EDIT_CONFLICT",
        "A referenced document changed while preparing the rename",
      ));
    }
  }
  Ok(())
}

pub(super) async fn apply_external(
  workspace: &crate::workspace::Workspace,
  edits: Vec<External>,
) -> BackendResult<Vec<crate::workspace::BufferStatus>> {
  let mut statuses = Vec::new();
  for edit in edits {
    // Retain the baseline captured by validation. Refreshing a clean buffer
    // here could accept an intervening external edit and overwrite it later.
    workspace
      .restore_file_under_lock(&edit.path, &edit.after)
      .await?;
    if let Some(status) = workspace.buffer_status(&edit.path).await? {
      statuses.push(status);
    }
  }
  Ok(statuses)
}

pub fn prepare(index: &Index, request: &MarkdownRequest) -> BackendResult<RenamePlan> {
  let Some(path) = request.path.as_ref() else {
    return Ok(reject("No rename target"));
  };
  let Some(file) = index.files.get(path) else {
    return Ok(reject("No rename target"));
  };
  let Some(heading) = file
    .headings
    .iter()
    .find(|heading| heading.line == request.line)
  else {
    return Ok(reject("Rename is only supported on Markdown headings"));
  };
  let Some(name) = request
    .new_name
    .as_deref()
    .map(str::trim)
    .filter(|name| !name.is_empty())
  else {
    return Ok(reject("Heading text cannot be empty"));
  };
  if name.contains(['\n', '\r']) || name.chars().count() > 1000 {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Heading name must be one bounded line",
    ));
  }
  let slug = document::slug(name);
  let line = file.content.lines().nth(heading.line - 1).unwrap_or("");
  let content_start = heading_content_start(line);
  let Some(start) = line[content_start..]
    .find(&heading.text)
    .map(|start| start + content_start)
  else {
    return Ok(reject("Heading text could not be located"));
  };
  let end = if heading.text.is_empty() {
    line.trim_end().len().max(start)
  } else {
    start + heading.text.len()
  };
  let replacement =
    if heading.text.is_empty() && start > 0 && line.as_bytes().get(start - 1) == Some(&b'#') {
      format!(" {name}")
    } else {
      name.into()
    };
  let mut edits = vec![Edit {
    path: path.clone(),
    line: heading.line,
    start_column: line[..start].encode_utf16().count() + 1,
    end_column: line[..end].encode_utf16().count() + 1,
    new_text: replacement,
  }];
  for document in index.files.values() {
    for link in &document.links {
      if link.is_external
        || link.target_path.as_ref() != Some(path)
        || link.target_heading_slug.as_ref() != Some(&heading.slug)
      {
        continue;
      }
      if link.offset == link.end_offset
        || document.content.get(link.offset..link.end_offset) != Some(link.target.as_str())
      {
        continue;
      }
      let Some(hash) = link.target.find('#') else {
        continue;
      };
      edits.push(Edit {
        path: document.path.clone(),
        line: link.line,
        start_column: link.column,
        end_column: link.column + link.target.encode_utf16().count(),
        new_text: format!("{}#{slug}", &link.target[..hash]),
      });
    }
  }
  let mut grouped = BTreeMap::<String, Vec<Edit>>::new();
  for edit in &edits {
    if &edit.path != path {
      grouped
        .entry(edit.path.clone())
        .or_default()
        .push(edit.clone());
    }
  }
  let mut external = Vec::new();
  for (path, mut edits) in grouped {
    let Some(file) = index.files.get(&path) else {
      continue;
    };
    edits.sort_by(|a, b| {
      b.line
        .cmp(&a.line)
        .then(b.start_column.cmp(&a.start_column))
    });
    let before = file.content.to_string();
    let mut after = before.clone();
    for edit in &edits {
      after = utf16::apply(
        &after,
        &Change {
          range: Range {
            start: Position {
              line: edit.line - 1,
              character: edit.start_column - 1,
            },
            end: Position {
              line: edit.line - 1,
              character: edit.end_column - 1,
            },
          },
          range_length: None,
          text: edit.new_text.clone(),
        },
      )?;
      if after.len() > 64 * 1024 * 1024 {
        return Err(BackendError::new(
          "FILE_TOO_LARGE",
          "Renamed references exceed document limit",
        ));
      }
    }
    if before != after {
      external.push(External {
        path,
        before,
        after,
        edit_count: edits.len(),
      });
    }
  }
  let result = RenameResult {
    edits: edits
      .into_iter()
      .filter(|edit| &edit.path == path)
      .collect(),
    applied_edits: external.iter().map(|edit| edit.edit_count).sum(),
    touched_files: external.iter().map(|edit| edit.path.clone()).collect(),
    reject_reason: None,
  };
  Ok(RenamePlan {
    result,
    source: Some(Source {
      path: path.clone(),
      content: file.content.to_string(),
    }),
    external,
  })
}
fn heading_content_start(line: &str) -> usize {
  let trimmed = line.trim_start_matches(' ');
  let indent = line.len() - trimmed.len();
  let hashes = trimmed.bytes().take_while(|byte| *byte == b'#').count();
  if indent <= 3 && (1..=6).contains(&hashes) && trimmed[hashes..].is_empty() {
    return line.len();
  }
  if indent <= 3 && (1..=6).contains(&hashes) && trimmed[hashes..].starts_with([' ', '\t']) {
    line.len() - trimmed[hashes..].trim_start_matches([' ', '\t']).len()
  } else {
    0
  }
}

fn reject(reason: &str) -> RenamePlan {
  RenamePlan {
    result: RenameResult {
      edits: Vec::new(),
      applied_edits: 0,
      touched_files: Vec::new(),
      reject_reason: Some(reason.into()),
    },
    source: None,
    external: Vec::new(),
  }
}

#[cfg(test)]
#[path = "rename_tests.rs"]
mod tests;
