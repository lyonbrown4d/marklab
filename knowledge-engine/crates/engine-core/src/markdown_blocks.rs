#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MarkdownGraphBlock {
  pub id: String,
  pub kind: MarkdownGraphBlockKind,
  pub text: Option<String>,
  pub level: Option<u32>,
  pub language: Option<String>,
  pub ordered: Option<bool>,
  pub items: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkdownGraphBlockKind {
  Paragraph,
  Blockquote,
  Code,
  List,
  Divider,
  Table,
}

pub(crate) fn parse_markdown_blocks(base_id: &str, markdown: &str) -> Vec<MarkdownGraphBlock> {
  let normalized = markdown.replace("\r\n", "\n").replace('\r', "\n");
  let lines = normalized.lines().collect::<Vec<_>>();
  let mut blocks = Vec::new();
  let mut index = 0;

  while index < lines.len() {
    while index < lines.len() && lines[index].trim().is_empty() {
      index += 1;
    }
    if index >= lines.len() {
      break;
    }

    if let Some((marker, language)) = fence_start(lines[index]) {
      let (text, next_index) = collect_code_block(&lines, index + 1, marker);
      index = next_index;
      push_block(
        base_id,
        &mut blocks,
        MarkdownGraphBlockKind::Code,
        non_empty(trim_line_breaks(&text)),
        None,
        non_empty(language),
        None,
        Vec::new(),
      );
      continue;
    }

    if divider_line(lines[index]) {
      index += 1;
      push_block(
        base_id,
        &mut blocks,
        MarkdownGraphBlockKind::Divider,
        None,
        None,
        None,
        None,
        Vec::new(),
      );
      continue;
    }

    if quote_line(lines[index]).is_some() {
      let (text, level, next_index) = collect_blockquote(&lines, index);
      index = next_index;
      push_block(
        base_id,
        &mut blocks,
        MarkdownGraphBlockKind::Blockquote,
        non_empty(text.trim().to_string()),
        Some(level),
        None,
        None,
        Vec::new(),
      );
      continue;
    }

    if list_marker(lines[index]).is_some() {
      let (ordered, items, next_index) = collect_list(&lines, index);
      index = next_index;
      push_block(
        base_id,
        &mut blocks,
        MarkdownGraphBlockKind::List,
        None,
        None,
        None,
        Some(ordered),
        items,
      );
      continue;
    }

    let (text, next_index) = collect_paragraph(&lines, index);
    index = next_index;
    let text = trim_line_breaks(&text).trim().to_string();
    let kind = if table_like(&text) {
      MarkdownGraphBlockKind::Table
    } else {
      MarkdownGraphBlockKind::Paragraph
    };
    push_block(
      base_id,
      &mut blocks,
      kind,
      non_empty(text),
      None,
      None,
      None,
      Vec::new(),
    );
  }

  blocks
}

#[allow(clippy::too_many_arguments)]
fn push_block(
  base_id: &str,
  blocks: &mut Vec<MarkdownGraphBlock>,
  kind: MarkdownGraphBlockKind,
  text: Option<String>,
  level: Option<u32>,
  language: Option<String>,
  ordered: Option<bool>,
  items: Vec<String>,
) {
  if text.is_none() && items.is_empty() && kind != MarkdownGraphBlockKind::Divider {
    return;
  }
  blocks.push(MarkdownGraphBlock {
    id: format!("{base_id}:block:{}", blocks.len()),
    kind,
    text,
    level,
    language,
    ordered,
    items,
  });
}

fn collect_code_block(lines: &[&str], mut index: usize, marker: char) -> (String, usize) {
  let mut content = Vec::new();
  while index < lines.len() {
    if fence_start(lines[index]).is_some_and(|(candidate, _)| candidate == marker) {
      return (content.join("\n"), index + 1);
    }
    content.push(lines[index]);
    index += 1;
  }
  (content.join("\n"), index)
}

fn collect_blockquote(lines: &[&str], mut index: usize) -> (String, u32, usize) {
  let mut content = Vec::new();
  let mut level = 1_u32;
  while index < lines.len() {
    let Some((line_level, text)) = quote_line(lines[index]) else {
      break;
    };
    level = level.max(line_level);
    content.push(text);
    index += 1;
  }
  (trim_line_breaks(&content.join("\n")), level, index)
}

fn collect_list(lines: &[&str], mut index: usize) -> (bool, Vec<String>, usize) {
  let mut ordered = false;
  let mut items = Vec::new();
  while index < lines.len() {
    let Some(marker) = list_marker(lines[index]) else {
      break;
    };
    ordered = ordered || marker.ordered;
    let text = lines[index][marker.end..].trim().to_string();
    if !text.is_empty() {
      items.push(text);
    }
    index += 1;
  }
  (ordered, items, index)
}

fn collect_paragraph(lines: &[&str], mut index: usize) -> (String, usize) {
  let mut content = Vec::new();
  while index < lines.len() {
    let line = lines[index];
    if line.trim().is_empty()
      || fence_start(line).is_some()
      || divider_line(line)
      || quote_line(line).is_some()
      || list_marker(line).is_some()
    {
      break;
    }
    content.push(line);
    index += 1;
  }
  (content.join("\n"), index)
}

fn fence_start(line: &str) -> Option<(char, String)> {
  let trimmed = line.trim_start();
  let marker = trimmed.chars().next()?;
  if marker != '`' && marker != '~' {
    return None;
  }
  let count = trimmed.chars().take_while(|value| *value == marker).count();
  (count >= 3).then(|| (marker, trimmed[count..].trim().to_string()))
}

fn divider_line(line: &str) -> bool {
  let trimmed = line.trim();
  if trimmed.len() < 3 {
    return false;
  }
  let Some(marker) = trimmed.chars().next() else {
    return false;
  };
  (marker == '-' || marker == '_' || marker == '*')
    && trimmed
      .chars()
      .all(|value| value == marker || value.is_whitespace())
}

fn quote_line(line: &str) -> Option<(u32, String)> {
  let trimmed = line.trim_start();
  if !trimmed.starts_with('>') {
    return None;
  }
  let level = trimmed.chars().take_while(|value| *value == '>').count();
  Some((
    level.min(u32::MAX as usize) as u32,
    trimmed[level..].trim_start().to_string(),
  ))
}

struct ListMarker {
  ordered: bool,
  end: usize,
}

fn list_marker(line: &str) -> Option<ListMarker> {
  let indent = line.len() - line.trim_start().len();
  if indent > 3 {
    return None;
  }
  let rest = &line[indent..];
  if rest.starts_with("- ") || rest.starts_with("* ") || rest.starts_with("+ ") {
    return Some(ListMarker {
      ordered: false,
      end: indent + 2,
    });
  }

  let digits = rest
    .chars()
    .take_while(|value| value.is_ascii_digit())
    .count();
  if digits == 0 || digits > 9 {
    return None;
  }
  let marker = rest.chars().nth(digits)?;
  let space = rest.chars().nth(digits + 1)?;
  ((marker == '.' || marker == ')') && space.is_whitespace()).then_some(ListMarker {
    ordered: true,
    end: indent + digits + 2,
  })
}

fn table_like(text: &str) -> bool {
  let rows = text.lines().collect::<Vec<_>>();
  rows.len() >= 2 && rows.iter().any(|line| line.contains('|'))
}

fn trim_line_breaks(value: &str) -> String {
  value.trim_matches('\n').to_string()
}

fn non_empty(value: String) -> Option<String> {
  (!value.is_empty()).then_some(value)
}
