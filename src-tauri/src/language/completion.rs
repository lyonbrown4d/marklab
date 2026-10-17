use super::{Document, mermaid, types::Position, utf16};
use crate::{
    analysis::{Index, targets},
    error::BackendResult,
};
use serde_json::{Value, json};

const LANGUAGES: &[&str] = &[
    "bash",
    "c",
    "cpp",
    "css",
    "diff",
    "go",
    "html",
    "java",
    "javascript",
    "json",
    "kotlin",
    "markdown",
    "mermaid",
    "python",
    "rust",
    "shell",
    "sql",
    "swift",
    "text",
    "toml",
    "tsx",
    "typescript",
    "xml",
    "yaml",
];

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
                        item["textEdit"]["range"][edge]["line"] =
                            json!(line + block.start_line as u64);
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
    let mut items = Vec::new();
    if let Some(fence) = before.find("```") {
        let start = fence + 3;
        let query = before[start..].to_lowercase();
        for language in LANGUAGES
            .iter()
            .filter(|language| language.starts_with(&query))
        {
            items.push(item(
                language,
                language,
                "Code block language",
                14,
                position,
                before[..start].encode_utf16().count(),
            ));
        }
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
                for heading in file.headings.iter().filter(|heading| {
                    heading.text.to_lowercase().contains(&query.to_lowercase())
                        || heading.slug.contains(&query.to_lowercase())
                }) {
                    items.push(item(
                        &heading.text,
                        &heading.slug,
                        &file.path,
                        18,
                        position,
                        before[..start + fragment.find('#').unwrap_or(0) + 1]
                            .encode_utf16()
                            .count(),
                    ));
                }
            }
        } else {
            let query = fragment.to_lowercase();
            for file in index
                .files
                .values()
                .filter(|file| {
                    file.path.to_lowercase().contains(&query)
                        || file.title.to_lowercase().contains(&query)
                })
                .take(200)
            {
                let insert = if wiki {
                    file.path
                        .trim_end_matches(".md")
                        .trim_end_matches(".markdown")
                        .to_owned()
                } else {
                    relative(path, &file.path)
                };
                items.push(item(
                    &file.title,
                    &insert,
                    &file.path,
                    17,
                    position,
                    before[..start].encode_utf16().count(),
                ));
            }
        }
    } else if before.trim().is_empty() {
        for (label, text) in [
            ("heading", "# ${1:Heading}"),
            ("link", "[${1:label}](${2:target})"),
            ("image", "![${1:alt}](${2:path})"),
            ("code block", "```${1:language}\n${0}\n```"),
            ("table", "| ${1:Heading} |\n| --- |\n| ${0} |"),
        ] {
            let mut completion = item(
                label,
                text,
                "Markdown snippet",
                15,
                position,
                position.character,
            );
            completion["insertTextFormat"] = json!(2);
            items.push(completion);
        }
    }
    Ok(json!({"isIncomplete":items.len()>=200,"items":items}))
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
fn relative(source: &str, target: &str) -> String {
    let source: Vec<_> = source
        .rsplit_once('/')
        .map_or("", |(parent, _)| parent)
        .split('/')
        .filter(|part| !part.is_empty())
        .collect();
    let target: Vec<_> = target.split('/').collect();
    let common = source
        .iter()
        .zip(&target)
        .take_while(|(a, b)| a == b)
        .count();
    let mut output = vec![".."; source.len() - common];
    output.extend_from_slice(&target[common..]);
    output.join("/")
}
