use crate::error::{BackendError, BackendResult};
use crate::workspace::Workspace;
use pulldown_cmark::{Event, Options, Parser, Tag};
use std::collections::BTreeMap;
use std::path::Path;

pub(super) fn image_urls(markdown: &str) -> Vec<String> {
    let mut urls = std::collections::BTreeSet::new();
    for event in Parser::new_ext(markdown, Options::ENABLE_TABLES | Options::ENABLE_FOOTNOTES) {
        if let Event::Start(Tag::Image { dest_url, .. }) = event {
            urls.insert(dest_url.into_string());
        }
        if urls.len() >= 50 {
            break;
        }
    }
    urls.into_iter().collect()
}

pub async fn load(
    workspace: &Workspace,
    source: &str,
    urls: Vec<String>,
) -> BackendResult<BTreeMap<String, Vec<u8>>> {
    let mut images = BTreeMap::new();
    let root = tokio::fs::canonicalize(workspace.root_directory()).await?;
    let source_path = tokio::fs::canonicalize(workspace.root_directory().join(source)).await?;
    let parent = source_path
        .parent()
        .ok_or_else(|| BackendError::new("INVALID_PATH", "Document has no parent"))?;
    let mut total = 0;
    for url in urls {
        if images.len() >= 50 {
            break;
        }
        if images.contains_key(&url) {
            continue;
        }
        let raw = url.split(['?', '#']).next().unwrap_or("");
        if raw.is_empty() || raw.contains(':') || raw.contains('\\') || Path::new(raw).is_absolute()
        {
            continue;
        }
        // URL parsing performs percent decoding without accepting a remote origin.
        let base = url::Url::from_directory_path(parent)
            .map_err(|_| BackendError::new("INVALID_PATH", "Invalid image base"))?;
        let Some(candidate) = base.join(raw).ok().and_then(|url| url.to_file_path().ok()) else {
            continue;
        };
        let Ok(candidate) = tokio::fs::canonicalize(candidate).await else {
            continue;
        };
        if !candidate.starts_with(&root) {
            continue;
        }
        let Ok(metadata) = tokio::fs::metadata(&candidate).await else {
            continue;
        };
        if !metadata.is_file() || metadata.len() > 15 * 1024 * 1024 {
            continue;
        }
        total += metadata.len();
        if total > 100 * 1024 * 1024 {
            break;
        }
        let bytes = tokio::fs::read(candidate).await?;
        if bytes.len() > 15 * 1024 * 1024 {
            return Err(BackendError::new(
                "FILE_TOO_LARGE",
                "Export image grew while reading",
            ));
        }
        images.insert(url, bytes);
    }
    Ok(images)
}
