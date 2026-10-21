use super::{
  Index,
  document::{Document, Link},
  queries::{InsightsRequest, invalid},
  query_types::*,
  targets,
};
use crate::error::BackendResult;
use serde_json::Value;
use std::collections::BTreeMap;

pub fn diagnostics(index: &Index, document: &Document) -> Vec<Value> {
  typed_diagnostics(index, document)
    .into_iter()
    .filter_map(|item| serde_json::to_value(item).ok())
    .collect()
}

pub(super) fn typed_diagnostics(index: &Index, document: &Document) -> Vec<Diagnostic> {
  document
    .links
    .iter()
    .filter(|link| targets::is_missing(link, &index.files, &index.paths))
    .map(|link| {
      let message = if link
        .target_path
        .as_ref()
        .is_some_and(|path| index.paths.contains(path))
      {
        format!("Missing heading anchor: {}", link.target)
      } else {
        format!("Cannot find Markdown target: {}", link.target)
      };
      Diagnostic {
        line: link.line,
        start_column: link.column,
        end_column: link.column + link.target.encode_utf16().count().max(1),
        message,
        severity: DiagnosticSeverity::Warning,
      }
    })
    .collect()
}

pub fn insights(index: &Index, request: InsightsRequest) -> BackendResult<InsightsResult> {
  let limit = request.asset_limit.unwrap_or(100);
  if limit > 500 {
    return Err(invalid("Asset limit exceeds 500"));
  }
  let current = index.files.get(&request.path);
  let current_assets: Vec<_> = current
    .map(|file| {
      file
        .assets
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
      file
        .assets
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
  let missing: Vec<_> = current
    .map(|file| {
      file
        .links
        .iter()
        .filter(|link| targets::is_missing(link, &index.files, &index.paths))
        .map(MissingTarget::from)
        .collect()
    })
    .unwrap_or_default();
  let asset_report = AssetReport {
    current_missing_count: current_assets
      .iter()
      .filter(|asset| asset.status == AssetStatus::Missing)
      .count(),
    current_asset_count: current_assets.len(),
    current_assets: current_assets.into_iter().take(limit).collect(),
    workspace_missing_count: all_missing.len(),
    workspace_missing_assets: all_missing.into_iter().take(limit).collect(),
    limit,
  };
  let knowledge = KnowledgeReport {
    incoming_count: incoming.len(),
    outgoing_count: outgoing.len(),
    missing_count: missing.len(),
    orphan: incoming.is_empty() && outgoing.is_empty(),
    incoming,
    outgoing,
    missing,
  };
  Ok(InsightsResult {
    ready: true,
    revision: index.revision,
    path: request.path.clone(),
    found: current.is_some(),
    headings: current
      .map(|file| file.headings.clone())
      .unwrap_or_default(),
    backlinks: backlinks(index, &request.path),
    diagnostics: current
      .map(|file| typed_diagnostics(index, file))
      .unwrap_or_default(),
    asset_report,
    knowledge,
  })
}

pub(super) fn backlinks(index: &Index, path: &str) -> Vec<Backlink> {
  index
    .files
    .values()
    .flat_map(|file| &file.links)
    .filter(|link| !link.is_external && link.target_path.as_deref() == Some(path))
    .map(|link| Backlink {
      source_path: link.source_path.clone(),
      text: link.text.clone(),
      context: link.context.clone(),
      line: link.line,
      column: link.column,
      target_anchor: link.target_anchor.clone(),
      target_heading_slug: link.target_heading_slug.clone(),
    })
    .collect()
}
pub(super) fn missing_link(link: &Link) -> MissingLink {
  MissingLink {
    path: link.source_path.clone(),
    link: MissingTarget::from(link),
  }
}
fn asset(index: &Index, link: &Link, number: usize) -> AssetReference {
  AssetReference {
    id: format!("{}:asset:{number}", link.source_path),
    source_path: link.source_path.clone(),
    target: link.target.clone(),
    target_path: link.target_path.clone(),
    media_type: link
      .target_path
      .as_ref()
      .and_then(|path| mime_guess::from_path(path).first_raw())
      .map(str::to_owned),
    context: link.context.clone(),
    line: link.line,
    column: link.column,
    status: if link.is_external {
      AssetStatus::Unverified
    } else if link
      .target_path
      .as_ref()
      .is_some_and(|path| index.paths.contains(path))
    {
      AssetStatus::Available
    } else {
      AssetStatus::Missing
    },
  }
}
fn knowledge(index: &Index, path: &str, incoming: bool) -> Vec<KnowledgeLink> {
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
  grouped
    .into_iter()
    .filter_map(|(path, links)| {
      links.first().map(|first| KnowledgeLink {
        label: index
          .files
          .get(&path)
          .map_or(path.clone(), |file| file.title.clone()),
        path,
        count: links.len(),
        first_line: first.line,
        first_column: first.column,
        first_text: first.text.clone(),
        first_context: first.context.clone(),
      })
    })
    .collect()
}
