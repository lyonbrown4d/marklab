use super::{
    types::{Change, MarkdownRequest, Position, Range},
    utf16,
};
use crate::{
    analysis::{Index, document},
    error::{BackendError, BackendResult},
};
use serde::Serialize;
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edit {
    pub path: String,
    pub line: usize,
    pub start_column: usize,
    pub end_column: usize,
    pub new_text: String,
}
pub struct RenamePlan {
    pub result: Value,
    pub external: Vec<External>,
}
pub struct External {
    pub path: String,
    pub before: String,
    pub after: String,
    pub edit_count: usize,
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
    let Some(start) = line.find(&heading.text) else {
        return Ok(reject("Heading text could not be located"));
    };
    let mut edits = vec![Edit {
        path: path.clone(),
        line: heading.line,
        start_column: line[..start].encode_utf16().count() + 1,
        end_column: line[..start + heading.text.len()].encode_utf16().count() + 1,
        new_text: name.into(),
    }];
    for document in index.files.values() {
        for link in &document.links {
            if link.is_external
                || link.target_path.as_ref() != Some(path)
                || link.target_heading_slug.as_ref() != Some(&heading.slug)
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
        }
        if after.len() > 64 * 1024 * 1024 {
            return Err(BackendError::new(
                "FILE_TOO_LARGE",
                "Renamed references exceed document limit",
            ));
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
    let result = json!({"edits":edits.into_iter().filter(|edit|&edit.path==path).collect::<Vec<_>>(),"appliedEdits":external.iter().map(|edit|edit.edit_count).sum::<usize>(),"touchedFiles":external.iter().map(|edit|edit.path.clone()).collect::<Vec<_>>(),"rejectReason":null});
    Ok(RenamePlan { result, external })
}
fn reject(reason: &str) -> RenamePlan {
    RenamePlan {
        result: json!({"edits":[],"appliedEdits":0,"touchedFiles":[],"rejectReason":reason}),
        external: Vec::new(),
    }
}
