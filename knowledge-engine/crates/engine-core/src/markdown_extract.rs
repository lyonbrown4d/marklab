use std::collections::HashMap;

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownExtraction {
  pub(crate) path: String,
  pub(crate) headings: Vec<MarkdownHeading>,
  pub(crate) links: Vec<MarkdownLink>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownHeading {
  pub(crate) level: u8,
  pub(crate) text: String,
  pub(crate) slug: String,
  pub(crate) line: usize,
  pub(crate) column: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownLink {
  pub(crate) source_path: String,
  pub(crate) text: String,
  pub(crate) target: String,
  pub(crate) line: usize,
  pub(crate) column: usize,
  pub(crate) is_external: bool,
}

pub(crate) fn extract_markdown(path: &str, content: &str) -> MarkdownExtraction {
  let mut headings = Vec::new();
  let mut links = Vec::new();
  let mut slug_counts = HashMap::new();
  let mut fence = FenceState::default();

  for (line_index, line) in content.lines().enumerate() {
    let line_number = line_index + 1;

    if fence.apply_line(line) {
      continue;
    }

    if let Some(heading) = extract_heading(line, line_number, &mut slug_counts) {
      headings.push(heading);
    }

    extract_links(path, line, line_number, &mut links);
  }

  MarkdownExtraction {
    path: path.to_string(),
    headings,
    links,
  }
}

fn extract_heading(
  line: &str,
  line_number: usize,
  slug_counts: &mut HashMap<String, usize>,
) -> Option<MarkdownHeading> {
  let chars: Vec<char> = line.chars().collect();
  let mut index = 0;

  while index < chars.len() && chars[index] == ' ' && index < 3 {
    index += 1;
  }

  if index >= chars.len() || chars[index] != '#' {
    return None;
  }

  let heading_column = index + 1;
  let mut level = 0;
  while index < chars.len() && chars[index] == '#' && level < 6 {
    level += 1;
    index += 1;
  }

  if index < chars.len() && chars[index] == '#' {
    return None;
  }

  if index < chars.len() && !chars[index].is_whitespace() {
    return None;
  }

  let raw_text = chars[index..].iter().collect::<String>();
  let text = clean_heading_text(&raw_text);

  if text.is_empty() {
    return None;
  }

  let slug = unique_slug(&slugify(&text), slug_counts);

  Some(MarkdownHeading {
    level,
    text,
    slug,
    line: line_number,
    column: heading_column,
  })
}

fn clean_heading_text(raw_text: &str) -> String {
  let trimmed = raw_text.trim();
  let mut chars: Vec<char> = trimmed.chars().collect();

  while chars.last().is_some_and(|last| last.is_whitespace()) {
    chars.pop();
  }

  let mut hash_count = 0;
  for char_value in chars.iter().rev() {
    if *char_value == '#' {
      hash_count += 1;
      continue;
    }

    break;
  }

  if hash_count > 0 {
    let before_hashes = chars.len().saturating_sub(hash_count);
    if before_hashes == 0 || chars[before_hashes - 1].is_whitespace() {
      chars.truncate(before_hashes);
    }
  }

  chars.iter().collect::<String>().trim().to_string()
}

fn slugify(text: &str) -> String {
  let mut slug = String::new();
  let mut pending_dash = false;

  for char_value in text.chars().flat_map(char::to_lowercase) {
    if char_value.is_alphanumeric() {
      if pending_dash && !slug.is_empty() {
        slug.push('-');
      }
      slug.push(char_value);
      pending_dash = false;
      continue;
    }

    if char_value.is_whitespace() || char_value == '-' {
      pending_dash = true;
    }
  }

  slug
}

fn unique_slug(slug: &str, slug_counts: &mut HashMap<String, usize>) -> String {
  let base_slug = if slug.is_empty() { "heading" } else { slug };
  let count = slug_counts.entry(base_slug.to_string()).or_insert(0);
  let unique = if *count == 0 {
    base_slug.to_string()
  } else {
    format!("{base_slug}-{count}")
  };
  *count += 1;
  unique
}

fn extract_links(source_path: &str, line: &str, line_number: usize, links: &mut Vec<MarkdownLink>) {
  let chars: Vec<char> = line.chars().collect();
  let mut index = 0;

  while index < chars.len() {
    if is_markdown_link_start(&chars, index) {
      if let Some((link, next_index)) = parse_markdown_link(source_path, &chars, index, line_number)
      {
        links.push(link);
        index = next_index;
        continue;
      }
    }

    if is_wiki_link_start(&chars, index) {
      if let Some((link, next_index)) = parse_wiki_link(source_path, &chars, index, line_number) {
        links.push(link);
        index = next_index;
        continue;
      }
    }

    index += 1;
  }
}

fn is_markdown_link_start(chars: &[char], index: usize) -> bool {
  chars[index] == '['
    && (index == 0 || chars[index - 1] != '!')
    && !is_wiki_link_start(chars, index)
}

fn is_wiki_link_start(chars: &[char], index: usize) -> bool {
  chars.get(index) == Some(&'[') && chars.get(index + 1) == Some(&'[')
}

fn parse_markdown_link(
  source_path: &str,
  chars: &[char],
  start: usize,
  line_number: usize,
) -> Option<(MarkdownLink, usize)> {
  let text_end = find_char(chars, start + 1, ']')?;

  if chars.get(text_end + 1) != Some(&'(') {
    return None;
  }

  let target_start = text_end + 2;
  let target_end = find_char(chars, target_start, ')')?;
  let text = chars[start + 1..text_end].iter().collect::<String>();
  let target = chars[target_start..target_end]
    .iter()
    .collect::<String>()
    .trim()
    .to_string();

  if target.is_empty() {
    return None;
  }

  Some((
    MarkdownLink {
      source_path: source_path.to_string(),
      text,
      is_external: is_external_target(&target),
      target,
      line: line_number,
      column: start + 1,
    },
    target_end + 1,
  ))
}

fn parse_wiki_link(
  source_path: &str,
  chars: &[char],
  start: usize,
  line_number: usize,
) -> Option<(MarkdownLink, usize)> {
  let mut index = start + 2;

  while index + 1 < chars.len() {
    if chars[index] == ']' && chars[index + 1] == ']' {
      let body = chars[start + 2..index].iter().collect::<String>();
      let (target, text) = parse_wiki_body(&body);

      if target.is_empty() {
        return None;
      }

      return Some((
        MarkdownLink {
          source_path: source_path.to_string(),
          text,
          is_external: is_external_target(&target),
          target,
          line: line_number,
          column: start + 1,
        },
        index + 2,
      ));
    }

    index += 1;
  }

  None
}

fn parse_wiki_body(body: &str) -> (String, String) {
  let mut parts = body.splitn(2, '|');
  let target = parts.next().unwrap_or_default().trim().to_string();
  let text = parts
    .next()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or(&target)
    .to_string();

  (target, text)
}

fn find_char(chars: &[char], start: usize, needle: char) -> Option<usize> {
  chars
    .iter()
    .enumerate()
    .skip(start)
    .find_map(|(index, char_value)| (*char_value == needle).then_some(index))
}

fn is_external_target(target: &str) -> bool {
  let lower = target.to_ascii_lowercase();
  lower.starts_with("http://")
    || lower.starts_with("https://")
    || lower.starts_with("mailto:")
    || lower.starts_with("tel:")
}

#[derive(Default)]
struct FenceState {
  marker: Option<char>,
  length: usize,
}

impl FenceState {
  fn apply_line(&mut self, line: &str) -> bool {
    let Some((marker, length)) = fence_marker(line) else {
      return self.marker.is_some();
    };

    if self.marker == Some(marker) && length >= self.length {
      self.marker = None;
      self.length = 0;
      return true;
    }

    if self.marker.is_none() {
      self.marker = Some(marker);
      self.length = length;
    }

    true
  }
}

fn fence_marker(line: &str) -> Option<(char, usize)> {
  let chars: Vec<char> = line.chars().collect();
  let mut index = 0;

  while index < chars.len() && chars[index] == ' ' && index < 3 {
    index += 1;
  }

  let marker = *chars.get(index)?;
  if marker != '`' && marker != '~' {
    return None;
  }

  let mut length = 0;
  while chars.get(index + length) == Some(&marker) {
    length += 1;
  }

  (length >= 3).then_some((marker, length))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn extracts_heading_slug_and_position() {
    let result = extract_markdown(
      "notes/demo.md",
      "# Hello, World!\n## Hello World ###\n## Hello World",
    );

    assert_eq!(result.headings.len(), 3);
    assert_eq!(result.headings[0].level, 1);
    assert_eq!(result.headings[0].text, "Hello, World!");
    assert_eq!(result.headings[0].slug, "hello-world");
    assert_eq!(result.headings[0].line, 1);
    assert_eq!(result.headings[0].column, 1);
    assert_eq!(result.headings[1].slug, "hello-world-1");
    assert_eq!(result.headings[2].slug, "hello-world-2");
  }

  #[test]
  fn extracts_markdown_link() {
    let result = extract_markdown("notes/demo.md", "See [Project Plan](docs/plan.md).");

    assert_eq!(result.links.len(), 1);
    assert_eq!(result.links[0].source_path, "notes/demo.md");
    assert_eq!(result.links[0].text, "Project Plan");
    assert_eq!(result.links[0].target, "docs/plan.md");
    assert_eq!(result.links[0].line, 1);
    assert_eq!(result.links[0].column, 5);
    assert!(!result.links[0].is_external);
  }

  #[test]
  fn extracts_wiki_link_with_alias() {
    let result = extract_markdown("notes/demo.md", "Related: [[docs/plan|Project Plan]]");

    assert_eq!(result.links.len(), 1);
    assert_eq!(result.links[0].text, "Project Plan");
    assert_eq!(result.links[0].target, "docs/plan");
    assert_eq!(result.links[0].column, 10);
    assert!(!result.links[0].is_external);
  }

  #[test]
  fn marks_external_links() {
    let result = extract_markdown(
      "notes/demo.md",
      "[Site](https://example.com)\n[[mailto:test@example.com|Email]]",
    );

    assert_eq!(result.links.len(), 2);
    assert!(result.links[0].is_external);
    assert!(result.links[1].is_external);
  }
}
