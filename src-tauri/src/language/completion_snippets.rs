use super::{Position, item};
use serde_json::{Value, json};

type Snippet = (
  &'static str,
  &'static str,
  &'static str,
  &'static [&'static str],
);
const SNIPPETS: &[Snippet] = &[
  ("Heading", "Markdown heading", "# ${1:Heading}", &["title"]),
  ("Link", "Markdown link", "[${1:text}](${2:path})", &["url"]),
  (
    "Image",
    "Markdown image",
    "![${1:alt}](${2:path})",
    &["asset"],
  ),
  (
    "Code fence",
    "Fenced code block",
    "```${1:language}\n${0}\n```",
    &["code", "block"],
  ),
  (
    "Table",
    "GFM table",
    "| ${1:Column 1} | ${2:Column 2} |\n| --- | --- |\n| ${3:Value} | ${4:Value} |",
    &["grid"],
  ),
  (
    "Task list",
    "Unchecked task list item",
    "- [ ] ${1:Task}",
    &["todo", "check"],
  ),
  (
    "Blockquote",
    "Markdown blockquote",
    "> ${1:Quote}",
    &["quote"],
  ),
  (
    "Horizontal rule",
    "Markdown horizontal rule",
    "---",
    &["divider", "separator"],
  ),
  (
    "Unordered list",
    "Markdown unordered list item",
    "- ${1:Item}",
    &["bullet", "list"],
  ),
  (
    "Ordered list",
    "Markdown ordered list item",
    "1. ${1:Item}",
    &["number", "list"],
  ),
];

pub(super) fn completions(uri: &str, before: &str, position: Position) -> Option<Vec<Value>> {
  if uri.to_lowercase().starts_with("marklab-embedded:") {
    return None;
  }
  let prefix = before.trim_start_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
  let query = prefix.strip_prefix('/')?;
  if !query.bytes().all(|c| c.is_ascii_alphabetic() || c == b'-') {
    return None;
  }
  let query = query.to_ascii_lowercase();
  let start = before[..before.len() - prefix.len()].encode_utf16().count();
  Some(
    SNIPPETS
      .iter()
      .filter(|(label, _, _, keywords)| {
        label.to_ascii_lowercase().contains(&query)
          || keywords.iter().any(|keyword| keyword.contains(&query))
      })
      .enumerate()
      .map(|(index, (label, detail, text, keywords))| {
        let mut value = item(label, text, detail, 15, position, start);
        value["insertTextFormat"] = json!(2);
        value["filterText"] = json!(
          std::iter::once(*label)
            .chain(keywords.iter().copied())
            .collect::<Vec<_>>()
            .join(" ")
        );
        value["sortText"] = json!(format!("90{index:02}"));
        value
      })
      .collect(),
  )
}
