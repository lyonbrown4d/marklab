use super::{
    Index,
    document::{Document, Link},
    targets,
};
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[derive(Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PageRequest {
    pub folder: Option<String>,
    pub issues_only: Option<bool>,
    pub query: Option<String>,
    pub sort: Option<String>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}
#[derive(Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct NavigationRequest {
    pub active_path: Option<String>,
    pub query: Option<String>,
    pub scope: Option<String>,
    pub limit: Option<usize>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct InsightsRequest {
    pub path: String,
    pub asset_limit: Option<usize>,
}

pub fn diagnostics(index: &Index, document: &Document) -> Vec<Value> {
    document.links.iter().filter(|link| targets::is_missing(link, &index.files, &index.paths)).map(|link| {
        let message = if link.target_path.as_ref().is_some_and(|path| index.paths.contains(path)) { format!("Missing heading anchor: {}", link.target) } else { format!("Cannot find Markdown target: {}", link.target) };
        json!({"line":link.line,"start_column":link.column,"end_column":link.column+link.target.encode_utf16().count().max(1),"message":message,"severity":"warning"})
    }).collect()
}

pub fn pages(index: &Index, request: PageRequest) -> BackendResult<Value> {
    let limit = request.limit.unwrap_or(100);
    if !(1..=500).contains(&limit)
        || request.sort.as_ref().is_some_and(|sort| {
            !["title", "path", "headings", "links", "issues"].contains(&sort.as_str())
        })
    {
        return Err(invalid("Invalid page query"));
    }
    let query = request.query.unwrap_or_default().to_lowercase();
    let folders: std::collections::BTreeSet<_> =
        index.files.keys().map(|path| folder(path)).collect();
    let mut items: Vec<_> = index.files.values().filter_map(|file| {
        let missing_assets = file.assets.iter().filter(|link| !link.is_external && link.target_path.as_ref().is_none_or(|path| !index.paths.contains(path))).count();
        let issues = diagnostics(index, file).len() + missing_assets;
        if request.issues_only == Some(true) && issues == 0 { return None; }
        if request.folder.as_ref().is_some_and(|parent| !file.path.starts_with(&format!("{parent}/")) && folder(&file.path) != *parent) { return None; }
        if !query.is_empty() && !format!("{} {}", file.path, file.title).to_lowercase().contains(&query) { return None; }
        Some(json!({"path":file.path,"title":file.title,"folder":folder(&file.path),"heading_count":file.headings.len(),"link_count":file.links.len(),"asset_count":file.assets.len(),"issue_count":issues}))
    }).collect();
    let sort = request.sort.as_deref().unwrap_or("title");
    items.sort_by(|left, right| {
        let number = match sort {
            "headings" => Some("heading_count"),
            "links" => Some("link_count"),
            "issues" => Some("issue_count"),
            _ => None,
        };
        number
            .map_or_else(
                || left[sort].as_str().cmp(&right[sort].as_str()),
                |field| right[field].as_u64().cmp(&left[field].as_u64()),
            )
            .then_with(|| left["path"].as_str().cmp(&right["path"].as_str()))
    });
    let total = items.len();
    let offset = request.offset.unwrap_or(0);
    Ok(
        json!({"ready":true,"revision":index.revision,"items":items.into_iter().skip(offset).take(limit).collect::<Vec<_>>(),"folders":folders,"total":total,"offset":offset,"limit":limit}),
    )
}

pub fn navigation(index: &Index, request: NavigationRequest) -> BackendResult<Value> {
    let limit = request.limit.unwrap_or(100);
    let scope = request.scope.as_deref().unwrap_or("all");
    if !(1..=500).contains(&limit) || !["all", "files", "headings"].contains(&scope) {
        return Err(invalid("Invalid navigation query"));
    }
    let query = request.query.unwrap_or_default().to_lowercase();
    let files: Vec<_> = index
        .files
        .values()
        .filter(|file| {
            scope != "headings"
                && format!("{} {}", file.path, file.title)
                    .to_lowercase()
                    .contains(&query)
        })
        .map(|file| json!({"path":file.path,"title":file.title}))
        .collect();
    let headings: Vec<_> = index
        .files
        .values()
        .flat_map(|file| &file.headings)
        .filter(|heading| {
            scope != "files"
                && format!("{} {}", heading.path, heading.text)
                    .to_lowercase()
                    .contains(&query)
        })
        .collect();
    let current = request
        .active_path
        .as_ref()
        .and_then(|path| index.files.get(path));
    let outgoing: Vec<_> = current
        .map(|file| {
            file.links
                .iter()
                .filter(|link| {
                    !link.is_external && !targets::is_missing(link, &index.files, &index.paths)
                })
                .collect()
        })
        .unwrap_or_default();
    let backlinks = request
        .active_path
        .as_ref()
        .map(|path| backlinks(index, path))
        .unwrap_or_default();
    let missing: Vec<_> = current
        .map(|file| {
            file.links
                .iter()
                .filter(|link| targets::is_missing(link, &index.files, &index.paths))
                .map(missing_link)
                .collect()
        })
        .unwrap_or_default();
    Ok(
        json!({"ready":true,"revision":index.revision,"active_path":request.active_path,
        "file_total":files.len(),"files":files.into_iter().take(limit).collect::<Vec<_>>(),"heading_total":headings.len(),"headings":headings.into_iter().take(limit).collect::<Vec<_>>(),"limit":limit,
        "current":{"headings":current.map(|file| file.headings.clone()).unwrap_or_default(),"outgoing_links":outgoing,"backlinks":backlinks,"missing_links":missing,
        "heading_total":current.map_or(0,|file|file.headings.len()),"outgoing_link_total":outgoing.len(),"backlink_total":backlinks.len(),"missing_link_total":missing.len()}}),
    )
}

pub fn summary(index: &Index) -> Value {
    let links: Vec<_> = index
        .files
        .values()
        .flat_map(|file| &file.links)
        .filter(|link| !link.is_external)
        .collect();
    let missing = links
        .iter()
        .filter(|link| targets::is_missing(link, &index.files, &index.paths))
        .count();
    let mut linked = std::collections::BTreeSet::new();
    for link in &links {
        if let Some(path) = &link.target_path
            && index.files.contains_key(path)
        {
            linked.insert(path.clone());
            linked.insert(link.source_path.clone());
        }
    }
    let attention = index
        .files
        .values()
        .filter(|file| {
            !diagnostics(index, file).is_empty()
                || file.assets.iter().any(|link| {
                    !link.is_external
                        && link
                            .target_path
                            .as_ref()
                            .is_none_or(|path| !index.paths.contains(path))
                })
        })
        .count();
    let structured = index
        .files
        .values()
        .filter(|file| file.headings.len() > 1)
        .count();
    json!({"ready":true,"revision":index.revision,"file_count":index.files.len(),"heading_count":index.files.values().map(|file|file.headings.len()).sum::<usize>(),"internal_link_count":links.len(),"linked_file_count":linked.len(),"missing_link_count":missing,"orphan_file_count":index.files.len()-linked.len(),"collection_counts":{"all":index.files.len(),"needs-attention":attention,"linked":linked.len(),"structured":structured}})
}

pub fn insights(index: &Index, request: InsightsRequest) -> BackendResult<Value> {
    let limit = request.asset_limit.unwrap_or(100);
    if limit > 500 {
        return Err(invalid("Asset limit exceeds 500"));
    }
    let current = index.files.get(&request.path);
    let current_assets: Vec<_> = current
        .map(|file| {
            file.assets
                .iter()
                .enumerate()
                .map(|(n, link)| asset(index, link, n))
                .collect()
        })
        .unwrap_or_default();
    let all_missing: Vec<_> = index
        .files
        .values()
        .flat_map(|file| {
            file.assets
                .iter()
                .enumerate()
                .filter(|(_, link)| {
                    !link.is_external
                        && link
                            .target_path
                            .as_ref()
                            .is_none_or(|path| !index.paths.contains(path))
                })
                .map(|(n, link)| asset(index, link, n))
        })
        .collect();
    let incoming = knowledge(index, &request.path, true);
    let outgoing = knowledge(index, &request.path, false);
    let missing: Vec<_> = current.map(|file| file.links.iter().filter(|link|targets::is_missing(link,&index.files,&index.paths)).map(|link|json!({"target":link.target,"text":link.text,"context":link.context,"line":link.line,"column":link.column,"link_type":link.link_type})).collect()).unwrap_or_default();
    Ok(
        json!({"ready":true,"revision":index.revision,"path":request.path,"found":current.is_some(),"headings":current.map(|file|file.headings.clone()).unwrap_or_default(),"backlinks":backlinks(index,&request.path),"diagnostics":current.map(|file|diagnostics(index,file)).unwrap_or_default(),
        "asset_report":{"current_missing_count":current_assets.iter().filter(|asset|asset["status"]=="missing").count(),"current_asset_count":current_assets.len(),"current_assets":current_assets.into_iter().take(limit).collect::<Vec<_>>(),"workspace_missing_count":all_missing.len(),"workspace_missing_assets":all_missing.into_iter().take(limit).collect::<Vec<_>>(),"limit":limit},
        "knowledge":{"incoming_count":incoming.len(),"outgoing_count":outgoing.len(),"missing_count":missing.len(),"orphan":incoming.is_empty()&&outgoing.is_empty(),"incoming":incoming,"outgoing":outgoing,"missing":missing}}),
    )
}

fn backlinks(index: &Index, path: &str) -> Vec<Value> {
    index.files.values().flat_map(|file|&file.links).filter(|link|!link.is_external&&link.target_path.as_deref()==Some(path)).map(|link|json!({"source_path":link.source_path,"text":link.text,"context":link.context,"line":link.line,"column":link.column,"target_anchor":link.target_anchor,"target_heading_slug":link.target_heading_slug})).collect()
}
fn missing_link(link: &Link) -> Value {
    json!({"path":link.source_path,"target":link.target,"text":link.text,"context":link.context,"line":link.line,"column":link.column,"link_type":link.link_type})
}
fn asset(index: &Index, link: &Link, number: usize) -> Value {
    json!({"id":format!("{}:asset:{number}",link.source_path),"source_path":link.source_path,"target":link.target,"target_path":link.target_path,"media_type":link.target_path.as_ref().and_then(|path|mime_guess::from_path(path).first_raw()),"context":link.context,"line":link.line,"column":link.column,"status":if link.is_external {"unverified"}else if link.target_path.as_ref().is_some_and(|path|index.paths.contains(path)){"available"}else{"missing"}})
}
fn knowledge(index: &Index, path: &str, incoming: bool) -> Vec<Value> {
    let mut grouped = BTreeMap::<String, Vec<&Link>>::new();
    for link in index
        .files
        .values()
        .flat_map(|file| &file.links)
        .filter(|link| !link.is_external && !targets::is_missing(link, &index.files, &index.paths))
    {
        let target = link.target_path.as_deref().unwrap_or("");
        if incoming && target == path {
            grouped
                .entry(link.source_path.clone())
                .or_default()
                .push(link);
        } else if !incoming && link.source_path == path {
            grouped.entry(target.into()).or_default().push(link);
        }
    }
    grouped.into_iter().filter_map(|(path,links)|links.first().map(|first|json!({"label":index.files.get(&path).map_or(path.clone(),|file|file.title.clone()),"path":path,"count":links.len(),"first_line":first.line,"first_column":first.column,"first_text":first.text,"first_context":first.context}))).collect()
}
fn folder(path: &str) -> String {
    path.rsplit_once('/')
        .map_or("", |(parent, _)| parent)
        .into()
}
fn invalid(message: &str) -> BackendError {
    BackendError::new("INVALID_REQUEST", message)
}
