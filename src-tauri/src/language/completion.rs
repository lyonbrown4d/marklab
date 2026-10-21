use super::protocol::{CompletionResponse, completion_list, position as lsp_position};
use super::{Document, mermaid, types::Position, utf16};
use crate::{
  analysis::{Index, document::LinkKind, targets},
  error::BackendResult,
};
use lsp_types::{CompletionItem, CompletionItemKind, CompletionTextEdit, Range, TextEdit};
#[path = "completion_fences.rs"]
mod fences;
#[path = "completion_files.rs"]
mod files;
#[path = "completion_headings.rs"]
mod headings;
#[path = "completion_snippets.rs"]
mod snippets;

pub fn completion(
  index: &Index,
  document: &Document,
  position: Position,
) -> BackendResult<CompletionResponse> {
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
    for item in &mut result.0.items {
      if let Some(CompletionTextEdit::Edit(edit)) = &mut item.text_edit {
        edit.range.start.line += block.start_line as u32;
        edit.range.end.line += block.start_line as u32;
      }
    }
    return Ok(result);
  }
  let line_start = document.text[..offset]
    .rfind('\n')
    .map_or(0, |index| index + 1);
  let before = &document.text[line_start..offset];
  if let Some(items) = snippets::completions(&document.uri, before, position) {
    return Ok(completion_list(items, false));
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
          link_type: if wiki {
            LinkKind::Wiki
          } else {
            LinkKind::Markdown
          },
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
  let is_incomplete = items.len() >= files::LIMIT;
  Ok(completion_list(items, is_incomplete))
}
fn item(
  label: &str,
  text: &str,
  detail: &str,
  kind: CompletionItemKind,
  position: Position,
  start: usize,
) -> CompletionItem {
  CompletionItem {
    label: label.into(),
    kind: Some(kind),
    detail: Some(detail.into()),
    insert_text: Some(text.into()),
    text_edit: Some(CompletionTextEdit::Edit(TextEdit {
      new_text: text.into(),
      range: Range::new(
        lsp_position(position.line, start),
        lsp_position(position.line, position.character),
      ),
    })),
    ..CompletionItem::default()
  }
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
