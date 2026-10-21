use super::markdown_types::*;
use super::protocol::position as lsp_position;
use super::{
  types::{MarkdownRequest, Position},
  utf16,
};
use crate::{
  analysis::{
    Index,
    document::{self, Document, Heading, Link},
    targets,
  },
  error::BackendResult,
};
use lsp_types::{Diagnostic, DiagnosticSeverity, Range};
use std::sync::Arc;

pub fn overlay(index: &Index, request: &MarkdownRequest) -> BackendResult<Index> {
  let mut index = index.clone();
  if let Some(path) = &request.path {
    let mut file = document::parse(path.clone(), request.content.clone())?;
    index.paths.insert(path.clone());
    let paths: Vec<_> = index
      .files
      .keys()
      .cloned()
      .chain(std::iter::once(path.clone()))
      .collect();
    for link in file.links.iter_mut().chain(&mut file.assets) {
      targets::resolve(link, &paths, &index.paths);
    }
    index.files.insert(path.clone(), Arc::new(file));
  }
  Ok(index)
}

pub fn symbols(request: &MarkdownRequest) -> BackendResult<Vec<MarkdownSymbol>> {
  let file = document::parse(
    request.path.clone().unwrap_or_default(),
    request.content.clone(),
  )?;
  let mut offset = 0;
  Ok(symbol_level(&file, &mut offset, 0))
}
fn symbol_level(file: &Document, offset: &mut usize, parent: u8) -> Vec<MarkdownSymbol> {
  let mut output = Vec::new();
  while let Some(heading) = file.headings.get(*offset) {
    if heading.level <= parent {
      break;
    }
    *offset += 1;
    let children = symbol_level(file, offset, heading.level);
    let column = symbol_column(file, heading);
    output.push(MarkdownSymbol {
      name: heading.text.clone(),
      level: heading.level,
      line: heading.line,
      column,
      end_column: column + heading.text.encode_utf16().count().max(1),
      lsp_kind: 15,
      children,
    });
  }
  output
}

fn symbol_column(file: &Document, heading: &Heading) -> usize {
  let line = file.content.lines().nth(heading.line - 1).unwrap_or("");
  let trimmed = line.trim_start();
  let markers = trimmed.bytes().take_while(|byte| *byte == b'#').count();
  let start = if (1..=6).contains(&markers) && trimmed[markers..].starts_with(char::is_whitespace) {
    line.len() - trimmed[markers..].trim_start().len()
  } else {
    0
  };
  let start = line[start..]
    .find(&heading.text)
    .map_or(start, |offset| start + offset);
  line[..start].encode_utf16().count() + 1
}

pub fn link_at<'a>(index: &'a Index, request: &MarkdownRequest) -> Option<&'a Link> {
  let file = index.files.get(request.path.as_ref()?)?;
  let offset = utf16::offset(
    &request.content,
    Position {
      line: request.line.checked_sub(1)?,
      character: request.column.checked_sub(1)?,
    },
  )
  .ok()?;
  file
    .links
    .iter()
    .chain(&file.assets)
    .find(|link| link.span_start <= offset && offset <= link.span_end)
}

pub fn definition(index: &Index, request: &MarkdownRequest) -> Option<MarkdownDefinition> {
  let link = link_at(index, request)?;
  if link.is_external {
    return None;
  }
  let path = link.target_path.as_ref()?;
  if !index.paths.contains(path) {
    return None;
  }
  let (line, end_column, heading_slug) = if let Some(anchor) = &link.target_heading_slug {
    let heading = index
      .files
      .get(path)?
      .headings
      .iter()
      .find(|heading| &heading.slug == anchor)?;
    (
      heading.line,
      Some(heading.text.encode_utf16().count() + 1),
      Some(heading.slug.clone()),
    )
  } else {
    (1, None, None)
  };
  Some(MarkdownDefinition {
    path: path.clone(),
    line,
    column: 1,
    end_column,
    heading_slug,
  })
}

pub fn reference_target(
  index: &Index,
  request: &MarkdownRequest,
) -> Option<(String, Option<String>)> {
  let path = request.path.as_ref()?;
  if let Some(heading) = index
    .files
    .get(path)?
    .headings
    .iter()
    .find(|heading| heading.line == request.line)
  {
    return Some((path.clone(), Some(heading.slug.clone())));
  }
  let definition = definition(index, request)?;
  Some((definition.path, definition.heading_slug))
}

pub fn references(index: &Index, request: &MarkdownRequest) -> Vec<MarkdownReference> {
  let Some((path, anchor)) = reference_target(index, request) else {
    return Vec::new();
  };
  index
    .files
    .values()
    .flat_map(|file| &file.links)
    .filter(|link| {
      !link.is_external
        && link.target_path.as_deref() == Some(path.as_str())
        && anchor
          .as_ref()
          .is_none_or(|anchor| link.target_heading_slug.as_ref() == Some(anchor))
    })
    .map(|link| MarkdownReference {
      path: link.source_path.clone(),
      line: link.line,
      column: link.column,
      end_column: link.column + link.target.encode_utf16().count(),
      text: link.text.clone(),
      context: link.context.clone(),
      target_anchor: link.target_anchor.clone(),
      target_heading_slug: link.target_heading_slug.clone(),
    })
    .collect()
}

pub fn hover(index: &Index, request: &MarkdownRequest) -> Option<MarkdownHover> {
  let link = link_at(index, request)?;
  if link.is_external {
    return None;
  }
  let path = link.target_path.as_deref().unwrap_or(&link.target);
  if index.paths.contains(path) && !index.files.contains_key(path) {
    return Some(MarkdownHover {
      path: path.into(),
      line: link.line,
      heading: None,
      markdown: format!(
        "### Local file\n\n`{path}`\n\nThis workspace file can be opened as a preview."
      ),
    });
  }
  if let Some(definition) = definition(index, request) {
    let line = definition.line;
    let heading = link
      .target_heading_slug
      .as_ref()
      .and_then(|anchor| {
        index
          .files
          .get(path)?
          .headings
          .iter()
          .find(|heading| &heading.slug == anchor)
      })
      .map(|heading| heading.text.clone());
    let title = heading
      .clone()
      .unwrap_or_else(|| "Markdown document".into());
    return Some(MarkdownHover {
      path: path.into(),
      line,
      heading,
      markdown: format!("### {title}\n\n{path}:{line}"),
    });
  }
  let message = if index.files.contains_key(path) {
    format!(
      "### Missing heading anchor\n\nCannot find `#{}` in `{path}`.",
      link.target_anchor.as_deref().unwrap_or("")
    )
  } else {
    format!(
      "### Broken Markdown link\n\nCannot find `{}`.\n\nQuick fix: create the missing Markdown file from the lightbulb menu.",
      link.target
    )
  };
  Some(MarkdownHover {
    path: path.into(),
    line: link.line,
    heading: None,
    markdown: message,
  })
}

pub use code_actions::code_actions;
#[path = "code_actions.rs"]
mod code_actions;

pub fn diagnostics(index: &Index, file: &Document) -> Vec<Diagnostic> {
  let mut diagnostics = crate::analysis::diagnostics(index, file)
    .into_iter()
    .map(|diagnostic| {
      let line = diagnostic["line"].as_u64().unwrap_or(1) as usize - 1;
      Diagnostic {
        message: diagnostic["message"].as_str().unwrap_or_default().into(),
        range: Range::new(
          lsp_position(
            line,
            diagnostic["start_column"].as_u64().unwrap_or(1) as usize - 1,
          ),
          lsp_position(
            line,
            diagnostic["end_column"].as_u64().unwrap_or(2) as usize - 1,
          ),
        ),
        severity: Some(DiagnosticSeverity::WARNING),
        source: Some("markdown".into()),
        ..Diagnostic::default()
      }
    })
    .collect::<Vec<_>>();
  diagnostics.extend(reference_diagnostics::compute(&file.content));
  diagnostics.sort_by(|left, right| {
    left
      .range
      .start
      .cmp(&right.range.start)
      .then(left.message.cmp(&right.message))
  });
  diagnostics.dedup();
  diagnostics
}

#[path = "heading_replacements.rs"]
mod heading_replacements;
#[cfg(test)]
#[path = "quickfix_tests.rs"]
mod quickfix_tests;
#[path = "reference_diagnostics.rs"]
mod reference_diagnostics;
#[cfg(test)]
#[path = "markdown_tests.rs"]
mod tests;
