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
use serde_json::{Value, json};
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

pub fn symbols(request: &MarkdownRequest) -> BackendResult<Value> {
  let file = document::parse(
    request.path.clone().unwrap_or_default(),
    request.content.clone(),
  )?;
  let mut offset = 0;
  Ok(json!(symbol_level(&file, &mut offset, 0)))
}
fn symbol_level(file: &Document, offset: &mut usize, parent: u8) -> Vec<Value> {
  let mut output = Vec::new();
  while let Some(heading) = file.headings.get(*offset) {
    if heading.level <= parent {
      break;
    }
    *offset += 1;
    let children = symbol_level(file, offset, heading.level);
    let column = symbol_column(file, heading);
    output.push(json!({"name":heading.text,"level":heading.level,"line":heading.line,"column":column,"endColumn":column+heading.text.encode_utf16().count().max(1),"lspKind":15,"children":children}));
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

pub fn definition(index: &Index, request: &MarkdownRequest) -> Value {
  let Some(link) = link_at(index, request) else {
    return Value::Null;
  };
  if link.is_external {
    return Value::Null;
  }
  let Some(path) = &link.target_path else {
    return Value::Null;
  };
  if !index.paths.contains(path) {
    return Value::Null;
  }
  if let Some(anchor) = &link.target_heading_slug {
    let Some(heading) = index
      .files
      .get(path)
      .and_then(|file| file.headings.iter().find(|heading| &heading.slug == anchor))
    else {
      return Value::Null;
    };
    json!({"path":path,"line":heading.line,"column":1,"endColumn":heading.text.encode_utf16().count()+1,"headingSlug":heading.slug})
  } else {
    json!({"path":path,"line":1,"column":1})
  }
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
  let definition = definition(index, request);
  definition["path"].as_str().map(|path| {
    (
      path.into(),
      definition["headingSlug"].as_str().map(str::to_owned),
    )
  })
}

pub fn references(index: &Index, request: &MarkdownRequest) -> Value {
  let Some((path, anchor)) = reference_target(index, request) else {
    return json!([]);
  };
  json!(index.files.values().flat_map(|file|&file.links).filter(|link|!link.is_external&&link.target_path.as_deref()==Some(path.as_str())&&anchor.as_ref().is_none_or(|anchor|link.target_heading_slug.as_ref()==Some(anchor))).map(|link|json!({"path":link.source_path,"line":link.line,"column":link.column,"endColumn":link.column+link.target.encode_utf16().count(),"text":link.text,"context":link.context,"targetAnchor":link.target_anchor,"targetHeadingSlug":link.target_heading_slug})).collect::<Vec<_>>())
}

pub fn hover(index: &Index, request: &MarkdownRequest) -> Value {
  let Some(link) = link_at(index, request) else {
    return Value::Null;
  };
  if link.is_external {
    return Value::Null;
  }
  let path = link.target_path.as_deref().unwrap_or(&link.target);
  if index.paths.contains(path) && !index.files.contains_key(path) {
    return json!({"path":path,"line":link.line,"heading":null,"markdown":format!("### Local file\n\n`{path}`\n\nThis workspace file can be opened as a preview.")});
  }
  let definition = definition(index, request);
  if !definition.is_null() {
    let line = definition["line"].as_u64().unwrap_or(1);
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
    return json!({"path":path,"line":line,"heading":heading,"markdown":format!("### {title}\n\n{path}:{line}")});
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
  json!({"path":path,"line":link.line,"heading":null,"markdown":message})
}

pub fn code_actions(index: &Index, request: &MarkdownRequest) -> Value {
  let Some(link) = link_at(index, request) else {
    return json!([]);
  };
  if link.is_external {
    return json!([]);
  }
  let Some(path) = &link.target_path else {
    return json!([]);
  };
  if !index.paths.contains(path) {
    let mut action = json!({"title":format!("Create missing Markdown file \"{path}\""),"kind":"create-file","path":path,"isPreferred":true});
    if let Some(anchor) = &link.target_anchor {
      action["content"] = json!(format!("# {}\n", anchor.replace(['-', '_'], " ")));
    }
    return json!([action]);
  }
  let Some(anchor) = &link.target_heading_slug else {
    return json!([]);
  };
  let Some(file) = index.files.get(path) else {
    return json!([]);
  };
  if file.headings.iter().any(|heading| &heading.slug == anchor) {
    return json!([]);
  }
  if link.offset >= link.end_offset
    || request.content.get(link.offset..link.end_offset) != Some(link.target.as_str())
  {
    return json!([]);
  }
  let Some(hash) = link.target.find('#') else {
    return json!([]);
  };
  let mut actions = Vec::new();
  for (n, heading) in heading_replacements::closest(anchor, &file.headings)
    .into_iter()
    .enumerate()
  {
    actions.push(json!({"title":format!("Replace missing heading anchor with #{}",heading.slug),"kind":"replace-text","isPreferred":n==0,"edit":{"path":request.path,"line":link.line,"startColumn":link.column+link.target[..hash].encode_utf16().count(),"endColumn":link.column+link.target.encode_utf16().count(),"newText":format!("#{}",heading.slug)}}));
  }
  actions.push(json!({"title":"Remove missing heading anchor","kind":"replace-text","isPreferred":actions.is_empty(),"edit":{"path":request.path,"line":link.line,"startColumn":link.column+link.target[..hash].encode_utf16().count(),"endColumn":link.column+link.target.encode_utf16().count(),"newText":""}}));
  json!(actions)
}

pub fn diagnostics(index: &Index, file: &Document) -> Value {
  let mut diagnostics = crate::analysis::diagnostics(index,file).into_iter().map(|diagnostic|json!({"message":diagnostic["message"],"range":{"start":{"line":diagnostic["line"].as_u64().unwrap_or(1)-1,"character":diagnostic["start_column"].as_u64().unwrap_or(1)-1},"end":{"line":diagnostic["line"].as_u64().unwrap_or(1)-1,"character":diagnostic["end_column"].as_u64().unwrap_or(2)-1}},"severity":2,"source":"markdown"})).collect::<Vec<_>>();
  diagnostics.extend(reference_diagnostics::compute(&file.content));
  diagnostics.sort_by(|left, right| {
    for field in ["line", "character"] {
      let order = left["range"]["start"][field]
        .as_u64()
        .cmp(&right["range"]["start"][field].as_u64());
      if !order.is_eq() {
        return order;
      }
    }
    left["message"].as_str().cmp(&right["message"].as_str())
  });
  diagnostics.dedup();
  json!(diagnostics)
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
