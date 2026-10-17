use super::{Index, document::Document, targets};
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::{BTreeMap, BTreeSet};

pub fn revision(index: &Index) -> String {
    format!("{}:{}", index.generation, index.revision)
}

pub fn graph(index: &Index) -> Value {
    let mut nodes = BTreeMap::new();
    let mut edges = BTreeMap::new();
    for document in index.files.values() {
        let id = format!("file:{}", document.path);
        let folder = document
            .path
            .rsplit_once('/')
            .map_or("Workspace", |(folder, _)| folder);
        nodes.insert(id.clone(),json!({"id":id,"kind":"file","label":document.title,"path":document.path,"group":{"key":folder,"label":folder,"source":"path"}}));
    }
    for document in index.files.values() {
        let source = format!("file:{}", document.path);
        for link in document.links.iter().chain(&document.assets) {
            if link.is_external {
                continue;
            }
            let path = link.target_path.as_deref().unwrap_or(&link.target);
            let missing = targets::is_missing(link, &index.files, &index.paths);
            let (target, kind) = if index.files.contains_key(path) && !missing {
                (
                    format!("file:{path}"),
                    if link.target_heading_slug.is_some() {
                        "references_heading"
                    } else {
                        "links_to"
                    },
                )
            } else if index.paths.contains(path) {
                (format!("preview:{path}"), "previews")
            } else {
                (format!("missing:{path}"), "links_to")
            };
            if target == source {
                continue;
            }
            nodes.entry(target.clone()).or_insert_with(||json!({"id":target,"kind":if index.paths.contains(path){"preview"}else{"missing"},"label":path,"path":path,"source_path":document.path,"target":link.target,"preview_kind":preview_kind(path)}));
            let (a, b) = if source < target {
                (source.clone(), target)
            } else {
                (target, source.clone())
            };
            edges.entry((a.clone(), b.clone())).or_insert_with(
                || json!({"id":format!("edge:{a}:{b}"),"source":a,"target":b,"kind":kind}),
            );
        }
    }
    json!({"mode":"mindmap","revision":revision(index),"nodes":nodes.into_values().collect::<Vec<_>>(),"edges":edges.into_values().collect::<Vec<_>>()})
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DetailsRequest {
    pub revision: String,
    pub node_ids: Vec<String>,
    pub mode: String,
    pub max_nodes: Option<usize>,
}

pub fn details(index: &Index, request: DetailsRequest) -> BackendResult<Value> {
    let limit = request.max_nodes.unwrap_or(32);
    if !(1..=64).contains(&limit)
        || request.node_ids.is_empty()
        || request.node_ids.len() > 256
        || !["summary", "full"].contains(&request.mode.as_str())
        || request
            .node_ids
            .iter()
            .any(|id| id.is_empty() || id.len() > 1024)
    {
        return Err(BackendError::new(
            "INVALID_REQUEST",
            "Invalid graph details query",
        ));
    }
    if request.revision != revision(index) {
        return Err(BackendError::new(
            "GRAPH_REVISION_MISMATCH",
            "Workspace graph changed; reload the topology",
        ));
    }
    let mut seen = BTreeSet::new();
    let selected: Vec<_> = request
        .node_ids
        .into_iter()
        .filter(|id| seen.insert(id.clone()))
        .collect();
    let items: Vec<_> = selected
        .iter()
        .take(limit)
        .filter_map(|id| {
            id.strip_prefix("file:")
                .and_then(|path| index.files.get(path))
                .map(|file| {
                    let mut item = json!({"id":id,"content":summary(file)});
                    if request.mode == "full" {
                        item["content_blocks"] = blocks(file);
                    }
                    item
                })
        })
        .collect();
    Ok(json!({"items":items,"revision":request.revision,"truncated":selected.len()>limit}))
}

pub fn summary(file: &Document) -> String {
    file.content
        .lines()
        .filter(|line| !line.trim_start().starts_with('#') && !line.trim().is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join("\n")
        .chars()
        .take(420)
        .collect()
}

fn blocks(file: &Document) -> Value {
    let mut blocks = Vec::new();
    let mut text = String::new();
    let mut code: Option<String> = None;
    for line in file.content.lines().take(2000) {
        if line.trim_start().starts_with("```") {
            if let Some(language) = code.take() {
                blocks.push(json!({"id":format!("{}:block:{}",file.path,blocks.len()),"kind":"code","text":text,"language":language}));
                text.clear();
            } else {
                code = Some(line.trim_start().trim_start_matches('`').trim().into());
            }
        } else if code.is_some() {
            text.push_str(line);
            text.push('\n');
        } else if !line.trim().is_empty() {
            blocks.push(json!({"id":format!("{}:block:{}",file.path,blocks.len()),"kind":if line.starts_with('>'){"blockquote"}else{"paragraph"},"text":line.chars().take(16384).collect::<String>()}));
        }
        if blocks.len() >= 24 {
            break;
        }
    }
    json!(blocks)
}

pub fn publication(index: &Index) -> Value {
    let mut incoming = BTreeMap::<String, usize>::new();
    for path in index.files.keys() {
        incoming.insert(path.clone(), 0);
    }
    for document in index.files.values() {
        for target in adjacent(index, &document.path) {
            *incoming.entry(target).or_default() += 1;
        }
    }
    let mut paths: Vec<_> = index.files.keys().cloned().collect();
    paths.sort_by_key(|path| (!entry(path), path.clone()));
    let primary = paths
        .iter()
        .find(|path| incoming.get(*path) == Some(&0))
        .cloned();
    let mut visited = BTreeSet::new();
    let mut ordered = Vec::new();
    if let Some(primary) = primary {
        visit(index, &primary, 0, false, &mut visited, &mut ordered);
    }
    for path in paths {
        visit(index, &path, 0, true, &mut visited, &mut ordered);
    }
    let chapters:Vec<_>=ordered.into_iter().filter_map(|(path,depth,orphaned)|index.files.get(&path).map(|file|json!({"path":path,"title":file.title,"depth":depth,"orphaned":orphaned,"wordCount":file.word_count,"estimatedPages":file.word_count.div_ceil(430).max(1),"excerpt":summary(file).chars().take(220).collect::<String>()}))).collect();
    json!({"title":std::path::Path::new(&index.root).file_name().map(|name|name.to_string_lossy()).unwrap_or_default(),"estimatedPages":chapters.iter().map(|chapter|chapter["estimatedPages"].as_u64().unwrap_or(0)).sum::<u64>()+2,"orphanCount":chapters.iter().filter(|chapter|chapter["orphaned"]==true).count(),"totalWords":index.files.values().map(|file|file.word_count).sum::<usize>(),"chapters":chapters})
}

fn visit(
    index: &Index,
    path: &str,
    depth: usize,
    orphaned: bool,
    visited: &mut BTreeSet<String>,
    ordered: &mut Vec<(String, usize, bool)>,
) {
    // Explicit stack avoids recursive traversal of adversarial link chains.
    let mut pending = vec![(path.to_owned(), depth)];
    while let Some((path, depth)) = pending.pop() {
        if !visited.insert(path.clone()) {
            continue;
        }
        ordered.push((path.clone(), depth.min(2), orphaned));
        let mut next = adjacent(index, &path);
        next.reverse();
        pending.extend(next.into_iter().map(|path| (path, depth + 1)));
    }
}
fn adjacent(index: &Index, path: &str) -> Vec<String> {
    let mut seen = BTreeSet::new();
    index
        .files
        .get(path)
        .into_iter()
        .flat_map(|file| &file.links)
        .filter_map(|link| link.target_path.as_ref())
        .filter(|target| {
            target.as_str() != path
                && index.files.contains_key(*target)
                && seen.insert((*target).clone())
        })
        .cloned()
        .collect()
}
fn entry(path: &str) -> bool {
    std::path::Path::new(path).file_stem().is_some_and(|stem| {
        [
            "readme",
            "index",
            "home",
            "intro",
            "introduction",
            "overview",
        ]
        .contains(&stem.to_string_lossy().to_lowercase().as_str())
    })
}
fn preview_kind(path: &str) -> &'static str {
    match std::path::Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("")
        .to_lowercase()
        .as_str()
    {
        "png" | "jpg" | "jpeg" | "gif" | "svg" | "webp" => "image",
        "pdf" => "pdf",
        "docx" => "docx",
        "mp3" | "wav" | "ogg" => "audio",
        "mp4" | "webm" => "video",
        "drawio" => "drawio",
        "excalidraw" => "excalidraw",
        _ => "source",
    }
}
