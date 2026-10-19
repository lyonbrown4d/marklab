use super::{types::Position, utf16};
use crate::error::{BackendError, BackendResult};
use pulldown_cmark::{CodeBlockKind, Event, Parser, Tag, TagEnd};
use serde_json::{Value, json};
use std::sync::LazyLock;

// Static templates preserve the existing editor catalog without a Node runtime.
static CATALOG: LazyLock<Result<Value, serde_json::Error>> =
  LazyLock::new(|| serde_json::from_str(include_str!("mermaid_catalog.json")));
pub struct Block {
  pub text: String,
  pub start_line: usize,
  pub end_line: usize,
}

pub fn blocks(text: &str) -> Vec<Block> {
  let mut output = Vec::new();
  let mut active: Option<Block> = None;
  for (event, range) in Parser::new(text).into_offset_iter() {
    match event {
      Event::Start(Tag::CodeBlock(CodeBlockKind::Fenced(language)))
        if ["mermaid", "mmd"].contains(&language.as_ref()) =>
      {
        active = Some(Block {
          text: String::new(),
          start_line: crate::analysis::document::position(text, range.start).0,
          end_line: 0,
        });
      }
      Event::Text(value) => {
        if let Some(block) = &mut active {
          block.text.push_str(&value);
        }
      }
      Event::End(TagEnd::CodeBlock) => {
        if let Some(mut block) = active.take() {
          block.end_line = block.start_line + block.text.lines().count();
          output.push(block);
        }
      }
      _ => {}
    }
  }
  output
}

pub fn completion(text: &str, position: Position) -> BackendResult<Value> {
  utf16::offset(text, position)?;
  if text.encode_utf16().count() > 128 * 1024 {
    return Ok(json!({"isIncomplete":false,"items":[]}));
  }
  let catalog = CATALOG
    .as_ref()
    .map_err(|error| BackendError::new("LANGUAGE_FAILED", error.to_string()))?;
  let prefix = text
    .split('\n')
    .take(position.line + 1)
    .collect::<Vec<_>>()
    .join("\n");
  let declaration = prefix
    .lines()
    .map(str::trim)
    .find(|line| !line.is_empty() && !line.starts_with("%%"))
    .unwrap_or("");
  let token = declaration
    .chars()
    .take_while(|c| c.is_ascii_alphanumeric() || *c == '-')
    .collect::<String>()
    .to_lowercase();
  let diagram = match token.as_str() {
    "flowchart" | "graph" => Some("flowchart"),
    "sequencediagram" => Some("sequence"),
    "classdiagram" => Some("class"),
    "statediagram" | "statediagram-v2" => Some("state"),
    "erdiagram" => Some("er"),
    "gantt" => Some("gantt"),
    "mindmap" => Some("mindmap"),
    "timeline" => Some("timeline"),
    _ => None,
  };
  let line = text.split('\n').nth(position.line).unwrap_or("");
  let byte = utf16::offset(
    line,
    Position {
      line: 0,
      character: position.character,
    },
  )?;
  let start = line[..byte]
    .char_indices()
    .rev()
    .find(|(_, c)| !c.is_ascii_alphanumeric() && !matches!(c, '-' | '_'))
    .map_or(0, |(offset, c)| offset + c.len_utf8());
  let end = line[byte..]
    .char_indices()
    .find(|(_, c)| !c.is_ascii_alphanumeric() && !matches!(c, '-' | '_'))
    .map_or(line.len(), |(offset, _)| byte + offset);
  let depth = prefix[..prefix.len() - line.len() + byte]
    .chars()
    .fold(0usize, |depth, c| match c {
      '{' => depth + 1,
      '}' => depth.saturating_sub(1),
      _ => depth,
    });
  let templates = match diagram {
    Some("class") if depth > 0 => &catalog["classMemberStatements"],
    Some("er") if depth > 0 => &catalog["erAttributeStatements"],
    Some(kind) => &catalog["statementCatalog"][kind],
    None if token.is_empty() || !recognized(&token) => &catalog["diagramDeclarations"],
    None => return Ok(json!({"isIncomplete":false,"items":[]})),
  };
  let items=templates.as_array().into_iter().flatten().enumerate().map(|(index,template)|json!({"label":template["label"],"detail":template["detail"],"filterText":template["label"],"insertTextFormat":2,"kind":template["kind"],"sortText":format!("{index:03}"),"textEdit":{"newText":template["newText"],"range":{"start":{"line":position.line,"character":line[..start].encode_utf16().count()},"end":{"line":position.line,"character":line[..end].encode_utf16().count()}}}})).collect::<Vec<_>>();
  Ok(json!({"isIncomplete":false,"items":items}))
}

pub fn diagnostics(text: &str, line_offset: usize) -> Value {
  if text.trim().is_empty() {
    return json!([]);
  }
  let failure = if text.encode_utf16().count() > 128 * 1024 {
    Some((
      "Mermaid language features are disabled above 131072 characters.".into(),
      3,
    ))
  } else {
    match merman_core::Engine::new().parse_diagram_sync(text, merman_core::ParseOptions::strict()) {
      Ok(Some(_)) => None,
      Ok(None) => Some(("Unknown Mermaid diagram declaration".into(), 1)),
      Err(error) => Some((error.to_string(), 1)),
    }
  };
  match failure {
    None => json!([]),
    Some((message, severity)) => {
      json!([{"message":message.chars().take(500).collect::<String>(),"range":{"start":{"line":line_offset,"character":0},"end":{"line":line_offset,"character":usize::from(!text.lines().next().unwrap_or("").is_empty())}},"severity":severity,"source":"mermaid"}])
    }
  }
}

fn recognized(token: &str) -> bool {
  [
    "architecture-beta",
    "block-beta",
    "c4component",
    "c4container",
    "c4context",
    "c4deployment",
    "gitgraph",
    "journey",
    "kanban",
    "packet-beta",
    "pie",
    "quadrantchart",
    "radar-beta",
    "requirementdiagram",
    "sankey-beta",
    "treemap",
    "usecase-beta",
    "xychart-beta",
    "zenuml",
  ]
  .contains(&token)
}
