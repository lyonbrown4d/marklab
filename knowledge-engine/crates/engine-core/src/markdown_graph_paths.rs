use std::path::Path;

use crate::markdown_extract::MarkdownLink;

pub(crate) struct ParsedGraphTarget {
  pub target_path: String,
  pub heading_slug: Option<String>,
}

pub(crate) fn parse_graph_link_target(
  link: &MarkdownLink,
  known_files: &[String],
) -> ParsedGraphTarget {
  let target = unwrap_link_destination(markdown_link_destination(link.target.trim()));
  let (path_part, anchor_part) = split_link_target(target);
  let heading_slug = anchor_part.and_then(heading_anchor_slug);
  let local_path = decode_uri_component(strip_query(path_part.trim()).trim());
  let local_path = local_path.trim();
  let candidate = if local_path.is_empty() {
    normalize_workspace_path(&link.source_path)
  } else {
    ensure_markdown_target(&resolve_relative_workspace_path(
      &link.source_path,
      local_path,
    ))
  };
  let target_path = resolve_markdown_path_candidate(&candidate, known_files)
    .or_else(|| find_file_by_label(local_path, known_files))
    .unwrap_or(candidate);

  ParsedGraphTarget {
    target_path,
    heading_slug,
  }
}

pub(crate) fn normalize_workspace_path(value: &str) -> String {
  let normalized = value.replace('\\', "/");
  let without_drive = if normalized.as_bytes().get(1) == Some(&b':') {
    normalized[2..].trim_start_matches('/').to_string()
  } else {
    normalized
  };
  let mut safe = Vec::new();
  for component in without_drive.split('/') {
    if component.is_empty() || component == "." {
      continue;
    }
    if component == ".." {
      safe.pop();
    } else {
      safe.push(component);
    }
  }
  safe.join("/")
}

pub(crate) fn file_node_id(file_path: &str) -> String {
  format!("file:{file_path}")
}

pub(crate) fn heading_node_id(file_path: &str, slug: &str) -> String {
  format!("heading:{file_path}:{slug}")
}

pub(crate) fn file_label(file_path: &str) -> String {
  let name = Path::new(file_path)
    .file_name()
    .and_then(|value| value.to_str())
    .unwrap_or(file_path);
  name
    .strip_suffix(".markdown")
    .or_else(|| name.strip_suffix(".md"))
    .unwrap_or(name)
    .to_string()
}

pub(crate) fn external_label(target: &str) -> String {
  target
    .strip_prefix("https://")
    .or_else(|| target.strip_prefix("http://"))
    .unwrap_or(target)
    .split('/')
    .next()
    .filter(|value| !value.trim().is_empty())
    .unwrap_or(target)
    .to_string()
}

fn split_link_target(target: &str) -> (&str, Option<&str>) {
  target
    .split_once('#')
    .map(|(path, anchor)| (path, Some(anchor)))
    .unwrap_or((target, None))
}

fn strip_query(target: &str) -> &str {
  target.split('?').next().unwrap_or(target)
}

fn markdown_link_destination(target: &str) -> &str {
  let trimmed = target.trim();
  if let Some(rest) = trimmed.strip_prefix('<') {
    if let Some(end) = rest.find('>') {
      return &trimmed[..end + 2];
    }
  }

  for (index, value) in trimmed.char_indices() {
    if value.is_whitespace() && starts_markdown_title(trimmed[index..].trim_start()) {
      return &trimmed[..index];
    }
  }

  trimmed
}

fn starts_markdown_title(value: &str) -> bool {
  value.starts_with('"') || value.starts_with('\'') || value.starts_with('(')
}

fn unwrap_link_destination(target: &str) -> &str {
  target
    .strip_prefix('<')
    .and_then(|value| value.strip_suffix('>'))
    .unwrap_or(target)
}

fn heading_anchor_slug(value: &str) -> Option<String> {
  let decoded = decode_uri_component(value);
  let trimmed = decoded.trim();
  (!trimmed.is_empty()).then(|| slugify(trimmed))
}

fn decode_uri_component(value: &str) -> String {
  let bytes = value.as_bytes();
  let mut decoded = Vec::with_capacity(bytes.len());
  let mut index = 0;

  while index < bytes.len() {
    if bytes[index] == b'%' {
      let high = bytes.get(index + 1).and_then(|value| hex_value(*value));
      let low = bytes.get(index + 2).and_then(|value| hex_value(*value));
      if let (Some(high), Some(low)) = (high, low) {
        decoded.push((high << 4) | low);
        index += 3;
        continue;
      }
    }

    decoded.push(bytes[index]);
    index += 1;
  }

  String::from_utf8_lossy(&decoded).to_string()
}

fn hex_value(value: u8) -> Option<u8> {
  match value {
    b'0'..=b'9' => Some(value - b'0'),
    b'a'..=b'f' => Some(value - b'a' + 10),
    b'A'..=b'F' => Some(value - b'A' + 10),
    _ => None,
  }
}

fn slugify(text: &str) -> String {
  let mut slug = String::new();
  let mut pending_dash = false;
  for value in text.chars().flat_map(char::to_lowercase) {
    if value.is_alphanumeric() {
      if pending_dash && !slug.is_empty() {
        slug.push('-');
      }
      slug.push(value);
      pending_dash = false;
    } else if value.is_whitespace() || value == '-' {
      pending_dash = true;
    }
  }
  if slug.is_empty() {
    "heading".to_string()
  } else {
    slug
  }
}

fn resolve_markdown_path_candidate(target_path: &str, known_files: &[String]) -> Option<String> {
  if contains_file(known_files, target_path) {
    return Some(target_path.to_string());
  }
  let candidates = if let Some(stem) = target_path.strip_suffix(".md") {
    vec![format!("{stem}.markdown")]
  } else if let Some(stem) = target_path.strip_suffix(".markdown") {
    vec![format!("{stem}.md")]
  } else {
    vec![
      format!("{target_path}.md"),
      format!("{target_path}.markdown"),
    ]
  };
  candidates
    .into_iter()
    .find(|candidate| contains_file(known_files, candidate))
}

fn find_file_by_label(target: &str, known_files: &[String]) -> Option<String> {
  if target.trim().is_empty() {
    return None;
  }
  let normalized = file_label(target).to_lowercase();
  known_files
    .iter()
    .find(|file| file_label(file).to_lowercase() == normalized)
    .cloned()
}

fn ensure_markdown_target(target_path: &str) -> String {
  let normalized = normalize_workspace_path(target_path);
  if normalized.is_empty() {
    return normalized;
  }
  if normalized
    .rsplit('/')
    .next()
    .and_then(|name| name.rsplit_once('.'))
    .is_none()
  {
    format!("{normalized}.md")
  } else {
    normalized
  }
}

fn resolve_relative_workspace_path(source_path: &str, target_path: &str) -> String {
  let normalized_target = target_path.replace('\\', "/");
  if normalized_target.starts_with('/') {
    return normalize_workspace_path(normalized_target.trim_start_matches('/'));
  }
  let source = normalize_workspace_path(source_path);
  let source_dir = source.rsplit_once('/').map(|(dir, _)| dir).unwrap_or("");
  if source_dir.is_empty() {
    normalize_workspace_path(&normalized_target)
  } else {
    normalize_workspace_path(&format!("{source_dir}/{normalized_target}"))
  }
}

fn contains_file(known_files: &[String], path: &str) -> bool {
  known_files.iter().any(|file| file == path)
}
