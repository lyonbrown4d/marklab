use super::query_details::{backlinks, missing_link, typed_diagnostics};
pub use super::query_details::{diagnostics, insights};
pub use super::query_types::*;
use super::{Index, targets};
use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};

#[derive(Default, Deserialize, Serialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct PageRequest {
  #[serde(default)]
  pub folder: Option<String>,
  #[serde(default)]
  pub issues_only: Option<bool>,
  #[serde(default)]
  pub query: Option<String>,
  #[serde(default)]
  pub sort: Option<String>,
  #[serde(default)]
  pub offset: Option<usize>,
  #[serde(default)]
  pub limit: Option<usize>,
}
#[derive(Default, Deserialize, Serialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct NavigationRequest {
  #[serde(default)]
  pub active_path: Option<String>,
  #[serde(default)]
  pub query: Option<String>,
  #[serde(default)]
  pub scope: Option<String>,
  #[serde(default)]
  pub limit: Option<usize>,
}
#[derive(Deserialize, Serialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct InsightsRequest {
  pub path: String,
  #[serde(default)]
  pub asset_limit: Option<usize>,
}

pub fn pages(index: &Index, request: PageRequest) -> BackendResult<PageResult> {
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
  let mut items: Vec<_> = index
    .files
    .values()
    .filter_map(|file| {
      let missing_assets = file
        .assets
        .iter()
        .filter(|link| {
          !link.is_external
            && link
              .target_path
              .as_ref()
              .is_none_or(|path| !index.paths.contains(path))
        })
        .count();
      let issues = typed_diagnostics(index, file).len() + missing_assets;
      if request.issues_only == Some(true) && issues == 0 {
        return None;
      }
      if request.folder.as_ref().is_some_and(|parent| {
        !file.path.starts_with(&format!("{parent}/")) && folder(&file.path) != *parent
      }) {
        return None;
      }
      if !query.is_empty()
        && !format!("{} {}", file.path, file.title)
          .to_lowercase()
          .contains(&query)
      {
        return None;
      }
      Some(PageItem {
        path: file.path.clone(),
        title: file.title.clone(),
        folder: folder(&file.path),
        heading_count: file.headings.len(),
        link_count: file.links.len(),
        asset_count: file.assets.len(),
        issue_count: issues,
      })
    })
    .collect();
  let sort = request.sort.as_deref().unwrap_or("title");
  items.sort_by(|left, right| {
    match sort {
      "headings" => right.heading_count.cmp(&left.heading_count),
      "links" => right.link_count.cmp(&left.link_count),
      "issues" => right.issue_count.cmp(&left.issue_count),
      "path" => left.path.cmp(&right.path),
      _ => left.title.cmp(&right.title),
    }
    .then_with(|| left.path.cmp(&right.path))
  });
  let total = items.len();
  let offset = request.offset.unwrap_or(0);
  Ok(PageResult {
    ready: true,
    revision: index.revision,
    items: items.into_iter().skip(offset).take(limit).collect(),
    folders: folders.into_iter().collect(),
    total,
    offset,
    limit,
  })
}

pub fn navigation(index: &Index, request: NavigationRequest) -> BackendResult<NavigationResult> {
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
    .map(|file| NavigationFile {
      path: file.path.clone(),
      title: file.title.clone(),
    })
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
    .cloned()
    .collect();
  let current = request
    .active_path
    .as_ref()
    .and_then(|path| index.files.get(path));
  let outgoing: Vec<_> = current
    .map(|file| {
      file
        .links
        .iter()
        .filter(|link| !link.is_external && !targets::is_missing(link, &index.files, &index.paths))
        .cloned()
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
      file
        .links
        .iter()
        .filter(|link| targets::is_missing(link, &index.files, &index.paths))
        .map(missing_link)
        .collect()
    })
    .unwrap_or_default();
  let current = NavigationCurrent {
    headings: current
      .map(|file| file.headings.clone())
      .unwrap_or_default(),
    heading_total: current.map_or(0, |file| file.headings.len()),
    outgoing_link_total: outgoing.len(),
    backlink_total: backlinks.len(),
    missing_link_total: missing.len(),
    outgoing_links: outgoing,
    backlinks,
    missing_links: missing,
  };
  Ok(NavigationResult {
    ready: true,
    revision: index.revision,
    active_path: request.active_path,
    file_total: files.len(),
    files: files.into_iter().take(limit).collect(),
    heading_total: headings.len(),
    headings: headings.into_iter().take(limit).collect(),
    limit,
    current,
  })
}

pub fn summary(index: &Index) -> KnowledgeSummary {
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
      !typed_diagnostics(index, file).is_empty()
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
  KnowledgeSummary {
    ready: true,
    revision: index.revision,
    file_count: index.files.len(),
    heading_count: index.files.values().map(|file| file.headings.len()).sum(),
    internal_link_count: links.len(),
    linked_file_count: linked.len(),
    missing_link_count: missing,
    orphan_file_count: index.files.len() - linked.len(),
    collection_counts: CollectionCounts {
      all: index.files.len(),
      needs_attention: attention,
      linked: linked.len(),
      structured,
    },
  }
}

fn folder(path: &str) -> String {
  path
    .rsplit_once('/')
    .map_or("", |(parent, _)| parent)
    .into()
}
pub(super) fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_REQUEST", message)
}
