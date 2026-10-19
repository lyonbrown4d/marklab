use super::{Document, mermaid, types::Position, utf16};
use crate::{
  analysis::{Index, targets},
  error::BackendResult,
};
use serde_json::{Value, json};
#[path = "completion_fences.rs"]
mod fences;
#[path = "completion_files.rs"]
mod files;
#[path = "completion_headings.rs"]
mod headings;
#[path = "completion_snippets.rs"]
mod snippets;

pub fn completion(index: &Index, document: &Document, position: Position) -> BackendResult<Value> {
  let offset = utf16::offset(&document.text, position)?;
  if document.language_id == "mermaid" {
    return mermaid::completion(&document.text, position);
  }
  if let Some(block) = mermaid::blocks(&document.text)
    .into_iter()
    .find(|block| position.line >= block.start_line && position.line < block.end_line)
  {
    let mut result = mermaid::completion(
      &block.text,
      Position {
        line: position.line - block.start_line,
        character: position.character,
      },
    )?;
    if let Some(items) = result["items"].as_array_mut() {
      for item in items {
        for edge in ["start", "end"] {
          if let Some(line) = item["textEdit"]["range"][edge]["line"].as_u64() {
            item["textEdit"]["range"][edge]["line"] = json!(line + block.start_line as u64);
          }
        }
      }
    }
    return Ok(result);
  }
  let line_start = document.text[..offset]
    .rfind('\n')
    .map_or(0, |index| index + 1);
  let before = &document.text[line_start..offset];
  if let Some(items) = snippets::completions(&document.uri, before, position) {
    return Ok(json!({"isIncomplete":false,"items":items}));
  }
  let mut items = Vec::new();
  if let Some(languages) = fences::completions(before, position) {
    items = languages;
  } else if let Some((start, wiki)) = link_prefix(before) {
    let fragment = &before[start..];
    let path = document.path.as_deref().unwrap_or("");
    if let Some((file, query)) = fragment.split_once('#') {
      let target = if file.is_empty() {
        Some(path.to_owned())
      } else {
        let mut link = crate::analysis::document::Link {
          source_path: path.into(),
          target: file.into(),
          text: String::new(),
          context: String::new(),
          line: 1,
          column: 1,
          link_type: if wiki { "wiki" } else { "markdown" }.into(),
          target_path: None,
          target_anchor: None,
          target_heading_slug: None,
          is_external: false,
          offset: 0,
          end_offset: 0,
          span_start: 0,
          span_end: 0,
        };
        targets::resolve(
          &mut link,
          &index.files.keys().cloned().collect::<Vec<_>>(),
          &index.paths,
        );
        link.target_path
      };
      if let Some(file) = target.and_then(|path| index.files.get(&path)) {
        items = headings::completions(
          file,
          query,
          position,
          before[..start + fragment.find('#').unwrap_or(0) + 1]
            .encode_utf16()
            .count(),
        );
      }
    } else {
      items = files::completions(
        index,
        path,
        fragment,
        wiki,
        position,
        before[..start].encode_utf16().count(),
      );
    }
  }
  Ok(json!({"isIncomplete":items.len()>=files::LIMIT,"items":items}))
}
fn item(
  label: &str,
  text: &str,
  detail: &str,
  kind: u8,
  position: Position,
  start: usize,
) -> Value {
  json!({"label":label,"kind":kind,"detail":detail,"insertText":text,"textEdit":{"newText":text,"range":{"start":{"line":position.line,"character":start},"end":position}}})
}
fn link_prefix(before: &str) -> Option<(usize, bool)> {
  let wiki = before
    .rfind("[[")
    .filter(|start| !before[start + 2..].contains("]]"));
  let markdown = before
    .rfind("](")
    .filter(|start| !before[start + 2..].contains(')'));
  match (wiki, markdown) {
    (Some(a), Some(b)) => Some((a.max(b) + 2, a > b)),
    (Some(a), None) => Some((a + 2, true)),
    (None, Some(b)) => Some((b + 2, false)),
    _ => None,
  }
}
#[cfg(test)]
#[path = "completion_tests.rs"]
mod tests;
