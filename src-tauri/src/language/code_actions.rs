use super::{heading_replacements, link_at};
use crate::{
  analysis::Index,
  language::{
    markdown_types::{MarkdownCodeAction, MarkdownTextEdit},
    types::MarkdownRequest,
  },
};

pub fn code_actions(index: &Index, request: &MarkdownRequest) -> Vec<MarkdownCodeAction> {
  let Some(link) = link_at(index, request) else {
    return Vec::new();
  };
  if link.is_external {
    return Vec::new();
  }
  let Some(path) = &link.target_path else {
    return Vec::new();
  };
  if !index.paths.contains(path) {
    return vec![MarkdownCodeAction::CreateFile {
      title: format!("Create missing Markdown file \"{path}\""),
      path: path.clone(),
      is_preferred: true,
      content: link
        .target_anchor
        .as_ref()
        .map(|anchor| format!("# {}\n", anchor.replace(['-', '_'], " "))),
    }];
  }
  let Some(anchor) = &link.target_heading_slug else {
    return Vec::new();
  };
  let Some(file) = index.files.get(path) else {
    return Vec::new();
  };
  if file.headings.iter().any(|heading| &heading.slug == anchor)
    || link.offset >= link.end_offset
    || request.content.get(link.offset..link.end_offset) != Some(link.target.as_str())
  {
    return Vec::new();
  }
  let Some(hash) = link.target.find('#') else {
    return Vec::new();
  };
  let replacement = |title, is_preferred, new_text| MarkdownCodeAction::ReplaceText {
    title,
    is_preferred,
    edit: MarkdownTextEdit {
      path: request.path.clone(),
      line: link.line,
      start_column: link.column + link.target[..hash].encode_utf16().count(),
      end_column: link.column + link.target.encode_utf16().count(),
      new_text,
    },
  };
  let mut actions = heading_replacements::closest(anchor, &file.headings)
    .into_iter()
    .enumerate()
    .map(|(n, heading)| {
      replacement(
        format!("Replace missing heading anchor with #{}", heading.slug),
        n == 0,
        format!("#{}", heading.slug),
      )
    })
    .collect::<Vec<_>>();
  actions.push(replacement(
    "Remove missing heading anchor".into(),
    actions.is_empty(),
    String::new(),
  ));
  actions
}
