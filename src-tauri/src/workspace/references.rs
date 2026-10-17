use crate::{
    analysis::{document, targets},
    error::{BackendError, BackendResult},
    workspace::{Workspace, buffers::read_disk, paths, scanning, types::Buffer},
};
use std::{collections::BTreeMap, sync::Arc};

pub(super) struct Rewrite {
    path: String,
    content: String,
    baseline: String,
}

pub(super) async fn prepare(
    workspace: &Workspace,
    from: &str,
    to: &str,
) -> BackendResult<Vec<Rewrite>> {
    workspace.ensure_active()?;
    let root = workspace.root_info();
    let directory = workspace.root_directory();
    let single = (root.kind == "single").then(|| std::path::PathBuf::from(root.path));
    let from = from.to_owned();
    let to = to.to_owned();
    // A fresh scan/read observes external changes before notify's debounce.
    // Caller has flushed authoritative drafts and holds mutation + commit_gate.
    let rewrites = crate::blocking::run(move || {
        let entries = scanning::scan(&directory, single.as_deref())?;
        let paths = entries
            .iter()
            .filter(|entry| entry.kind == "file")
            .map(|entry| entry.path.clone())
            .collect();
        let mut documents = BTreeMap::new();
        let mut total = 0usize;
        for entry in entries.iter().filter(|entry| {
            entry.kind == "file"
                && std::path::Path::new(&entry.path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|value| {
                        value.eq_ignore_ascii_case("md") || value.eq_ignore_ascii_case("markdown")
                    })
        }) {
            let content = read_disk(&paths::resolve(&directory, &entry.path)?)?;
            total = total.saturating_add(content.len());
            if total > 128 * 1024 * 1024 {
                return Err(BackendError::new(
                    "INDEX_TOO_LARGE",
                    "Workspace Markdown exceeds the 128 MiB indexing limit",
                ));
            }
            documents.insert(
                entry.path.clone(),
                Arc::new(document::parse(entry.path.clone(), content)?),
            );
        }
        targets::resolve_documents(&mut documents, &paths);
        let mut rewrites = Vec::new();
        for document in documents.values() {
            if let Some(rewrite) = rewrite(document, &from, &to)? {
                rewrites.push(rewrite);
            }
        }
        Ok(rewrites)
    })
    .await?;
    workspace.ensure_active()?;
    Ok(rewrites)
}

fn rewrite(document: &document::Document, from: &str, to: &str) -> BackendResult<Option<Rewrite>> {
    let source = moved(&document.path, from, to);
    let mut edits = Vec::new();
    for link in &document.links {
        let Some(target) = link.target_path.as_deref() else {
            continue;
        };
        let next = moved(target, from, to);
        if next == target || (source == next && link.target.starts_with('#')) {
            continue;
        }
        // Parsed destinations may be decoded/escaped or reference definitions.
        // Only edit a range proven to contain the literal destination itself.
        if link.offset == link.end_offset
            || document.content.get(link.offset..link.end_offset) != Some(link.target.as_str())
        {
            continue;
        }
        let suffix = link
            .target
            .find(['?', '#'])
            .map_or("", |offset| &link.target[offset..]);
        let destination = if link.link_type == "wiki" {
            let filename = next.rsplit('/').next().unwrap_or(&next);
            let label = match filename.rsplit_once('.') {
                Some((stem, extension))
                    if ["md", "markdown", "ics"]
                        .iter()
                        .any(|value| extension.eq_ignore_ascii_case(value)) =>
                {
                    stem.to_owned()
                }
                _ => filename.to_owned(),
            };
            encode_path(&label, true)
        } else {
            encode_path(&relative_target(&source, &next), false)
        };
        let replacement = format!("{destination}{suffix}");
        if replacement != link.target {
            edits.push((link.offset, link.end_offset, replacement));
        }
    }
    if edits.is_empty() {
        return Ok(None);
    }
    edits.sort_by_key(|edit| std::cmp::Reverse(edit.0));
    let mut content = document.content.to_string();
    let mut previous = content.len();
    for (start, end, replacement) in edits {
        if end > previous {
            continue;
        }
        content.replace_range(start..end, &replacement);
        if content.len() > crate::workspace::patches::MAX_DOCUMENT_BYTES {
            return Err(BackendError::new(
                "FILE_TOO_LARGE",
                "Renamed references exceed document limit",
            ));
        }
        previous = start;
    }
    Ok(Some(Rewrite {
        path: source,
        content,
        baseline: paths::fingerprint(&document.content),
    }))
}

fn encode_path(path: &str, wiki: bool) -> String {
    const HEX: &[u8] = b"0123456789ABCDEF";
    let mut output = String::with_capacity(path.len());
    for character in path.chars() {
        let safe = if wiki {
            !character.is_control() && !matches!(character, '#' | '?' | '|' | '[' | ']' | '%')
        } else {
            character.is_ascii_alphanumeric() || matches!(character, '/' | '.' | '-' | '_' | '~')
        };
        if safe {
            output.push(character);
        } else {
            for byte in character.encode_utf8(&mut [0; 4]).bytes() {
                output.push('%');
                output.push(HEX[(byte >> 4) as usize] as char);
                output.push(HEX[(byte & 15) as usize] as char);
            }
        }
    }
    output
}

fn moved(path: &str, from: &str, to: &str) -> String {
    if path == from {
        to.to_owned()
    } else if path
        .strip_prefix(from)
        .is_some_and(|tail| tail.starts_with('/'))
    {
        format!("{to}{}", &path[from.len()..])
    } else {
        path.to_owned()
    }
}

fn relative_target(source: &str, target: &str) -> String {
    let parent: Vec<_> = source.split('/').collect();
    let parent = &parent[..parent.len().saturating_sub(1)];
    let target: Vec<_> = target.split('/').collect();
    let common = parent
        .iter()
        .zip(&target)
        .take_while(|(a, b)| a == b)
        .count();
    std::iter::repeat_n("..", parent.len() - common)
        .chain(target[common..].iter().copied())
        .collect::<Vec<_>>()
        .join("/")
}

pub(super) fn publish(buffers: &mut BTreeMap<String, Buffer>, rewrites: Vec<Rewrite>) {
    for rewrite in rewrites {
        let revision = buffers
            .get(&rewrite.path)
            .map_or(0, |buffer| buffer.revision + 1);
        buffers.insert(
            rewrite.path,
            Buffer {
                content: rewrite.content,
                baseline: rewrite.baseline,
                revision,
                dirty: true,
            },
        );
    }
}
