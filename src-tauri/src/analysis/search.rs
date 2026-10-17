use super::{AnalysisService, Index, document::Document};
use crate::{
    error::{BackendError, BackendResult},
    workspace::Workspace,
};
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SearchRequest {
    pub query: String,
    pub limit: Option<usize>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OccurrenceOptions {
    pub case_sensitive: bool,
    pub whole_word: bool,
    pub use_regex: bool,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OccurrenceRequest {
    pub request_id: String,
    pub query: String,
    pub limit: Option<usize>,
    pub options: OccurrenceOptions,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelRequest {
    pub request_id: String,
}
#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
    pub snippet: String,
    pub snippet_highlights: Vec<Highlight>,
    pub score: f64,
}
#[derive(Debug, Serialize)]
pub struct Highlight {
    pub start: usize,
    pub end: usize,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OccurrenceResult {
    pub request_id: String,
    pub results: Vec<SearchResult>,
    pub total_hits: usize,
    pub scanned_documents: usize,
    pub truncated: bool,
}

impl AnalysisService {
    pub async fn search(
        &self,
        workspace: Arc<Workspace>,
        request: SearchRequest,
    ) -> BackendResult<Vec<SearchResult>> {
        let limit = request.limit.unwrap_or(100);
        validate(&request.query, limit)?;
        let index = self.index(workspace).await?;
        self.counted_search(
            index,
            request.query,
            limit,
            Arc::new(AtomicBool::new(false)),
        )
        .await
        .map(|result| result.results)
    }

    pub async fn occurrences(
        &self,
        owner: &str,
        workspace: Arc<Workspace>,
        request: OccurrenceRequest,
    ) -> BackendResult<OccurrenceResult> {
        validate(&request.query, request.limit.unwrap_or(500))?;
        if request.request_id.is_empty()
            || request.request_id.len() > 128
            || !request
                .request_id
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"._:-".contains(&byte))
        {
            return Err(invalid("Invalid search request ID"));
        }
        let key = (owner.to_owned(), request.request_id.clone());
        let cancelled = Arc::new(AtomicBool::new(false));
        {
            let mut searches = self.searches.lock().await;
            if searches.contains_key(&key) {
                return Err(invalid("Search request ID is already active"));
            }
            if searches.len() >= 128 {
                return Err(invalid("Too many searches are active"));
            }
            searches.insert(key.clone(), cancelled.clone());
        }
        let result = async {
            let index = self.index(workspace).await?;
            let _worker = self
                .workers
                .clone()
                .acquire_owned()
                .await
                .map_err(|_| invalid("Search worker unavailable"))?;
            tokio::task::spawn_blocking(move || scan(&index, request, &cancelled))
                .await
                .map_err(|error| invalid(&error.to_string()))?
        }
        .await;
        self.searches.lock().await.remove(&key);
        result
    }

    pub async fn cancel_occurrence(&self, owner: &str, id: &str) -> bool {
        self.searches
            .lock()
            .await
            .get(&(owner.into(), id.into()))
            .is_some_and(|cancelled| !cancelled.swap(true, Ordering::AcqRel))
    }
}

pub fn scan(
    index: &Index,
    request: OccurrenceRequest,
    cancelled: &AtomicBool,
) -> BackendResult<OccurrenceResult> {
    let mut expression = if request.options.use_regex {
        request.query.clone()
    } else {
        regex::escape(&request.query)
    };
    if request.options.whole_word {
        expression = format!("\\b(?:{expression})\\b");
    }
    let regex = RegexBuilder::new(&expression)
        .case_insensitive(!request.options.case_sensitive)
        .size_limit(4 * 1024 * 1024)
        .build()
        .map_err(regex_error)?;
    let limit = request.limit.unwrap_or(500);
    let mut results = Vec::new();
    let mut total_hits = 0;
    let mut scanned_documents = 0;
    'documents: for file in index.files.values() {
        if cancelled.load(Ordering::Acquire) {
            break;
        }
        for (line, text) in file.content.lines().enumerate() {
            if cancelled.load(Ordering::Acquire) {
                break 'documents;
            }
            for matched in regex.find_iter(text) {
                if matched.is_empty() {
                    continue;
                }
                total_hits += 1;
                if results.len() < limit {
                    results.push(result(file, line, text, matched.start(), matched.end()));
                }
            }
        }
        scanned_documents += 1;
    }
    Ok(OccurrenceResult {
        request_id: request.request_id,
        results,
        total_hits,
        scanned_documents,
        truncated: total_hits > limit || cancelled.load(Ordering::Acquire),
    })
}

pub(super) fn result(
    file: &Document,
    line: usize,
    text: &str,
    start: usize,
    end: usize,
) -> SearchResult {
    let before = text[..start].chars().count();
    let snippet_start = before.saturating_sub(80);
    let snippet: String = text.chars().skip(snippet_start).take(240).collect();
    let start_character = text[..start]
        .chars()
        .skip(snippet_start)
        .collect::<String>()
        .encode_utf16()
        .count();
    let highlighted = text[start..end].encode_utf16().count();
    SearchResult {
        path: file.path.clone(),
        title: file.title.clone(),
        line: line + 1,
        column: text[..start].encode_utf16().count() + 1,
        end_column: text[..end].encode_utf16().count() + 1,
        snippet_highlights: vec![Highlight {
            start: start_character,
            end: (start_character + highlighted).min(snippet.encode_utf16().count()),
        }],
        snippet,
        score: 1.0,
    }
}
fn validate(query: &str, limit: usize) -> BackendResult<()> {
    if query.trim().is_empty() || query.len() > 1024 || !(1..=500).contains(&limit) {
        Err(invalid(
            "Search requires a non-empty bounded query and a limit between 1 and 500",
        ))
    } else {
        Ok(())
    }
}
fn invalid(message: &str) -> BackendError {
    BackendError::new("INVALID_REQUEST", message)
}
fn regex_error(error: regex::Error) -> BackendError {
    BackendError::new("INVALID_REGEX", error.to_string())
}
