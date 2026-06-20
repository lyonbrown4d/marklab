use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use napi::bindgen_prelude::*;
use napi_derive::napi;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::{Field, Schema, Value, STORED, TEXT};
use tantivy::{doc, Index, IndexReader, IndexWriter, ReloadPolicy, Term};
use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

#[napi(object)]
#[derive(Clone, serde::Deserialize, serde::Serialize)]
pub struct SearchDocument {
    pub path: String,
    pub title: String,
    pub content: String,
}

#[napi(object)]
pub struct SearchHighlight {
    pub start: u32,
    pub end: u32,
}

#[napi(object)]
pub struct SearchResult {
    pub path: String,
    pub title: String,
    pub line: u32,
    pub column: u32,
    pub end_column: u32,
    pub snippet: String,
    pub snippet_highlights: Vec<SearchHighlight>,
    pub score: f64,
}

#[napi]
pub struct NativeSearchIndex {
    inner: Mutex<Option<SearchEngine>>,
}

#[napi]
impl NativeSearchIndex {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(None),
        }
    }

    #[napi]
    pub fn open(&self, index_path: String) -> Result<()> {
        let engine = SearchEngine::open(&index_path)?;
        *self.lock()? = Some(engine);
        Ok(())
    }

    #[napi]
    pub fn close(&self) -> Result<()> {
        *self.lock()? = None;
        Ok(())
    }

    #[napi]
    pub fn has_documents(&self) -> Result<bool> {
        let guard = self.lock()?;
        let Some(engine) = guard.as_ref() else {
            return Ok(false);
        };
        engine.has_documents()
    }

    #[napi]
    pub fn rebuild(&self, documents: Vec<SearchDocument>) -> Result<()> {
        let mut guard = self.lock()?;
        let engine = self.require_engine_mut(&mut guard)?;
        engine.rebuild(documents)
    }

    #[napi]
    pub fn upsert_document(&self, document: SearchDocument) -> Result<()> {
        let mut guard = self.lock()?;
        let engine = self.require_engine_mut(&mut guard)?;
        engine.upsert_document(document)
    }

    #[napi]
    pub fn remove_document(&self, path: String) -> Result<()> {
        let mut guard = self.lock()?;
        let engine = self.require_engine_mut(&mut guard)?;
        engine.remove_document(&path)
    }

    #[napi]
    pub fn remove_path_prefix(&self, prefix: String) -> Result<()> {
        let mut guard = self.lock()?;
        let engine = self.require_engine_mut(&mut guard)?;
        engine.remove_path_prefix(&prefix)
    }

    #[napi]
    pub fn search(&self, query: String, limit: u32) -> Result<Vec<SearchResult>> {
        let guard = self.lock()?;
        let Some(engine) = guard.as_ref() else {
            return Ok(Vec::new());
        };
        engine.search(&query, limit)
    }
}

impl NativeSearchIndex {
    fn lock(&self) -> Result<std::sync::MutexGuard<'_, Option<SearchEngine>>> {
        self.inner
            .lock()
            .map_err(|_| Error::from_reason("Native search index lock was poisoned."))
    }

    fn require_engine_mut<'a>(
        &self,
        guard: &'a mut Option<SearchEngine>,
    ) -> Result<&'a mut SearchEngine> {
        guard
            .as_mut()
            .ok_or_else(|| Error::from_reason("Native search index is not opened."))
    }
}

struct SearchEngine {
    index: Index,
    documents: Vec<SearchDocument>,
    documents_path: PathBuf,
    schema: SearchSchema,
    reader: IndexReader,
    writer: IndexWriter,
}

#[derive(Clone)]
struct SearchSchema {
    schema: Schema,
    path: Field,
    title: Field,
    body: Field,
    content: Field,
    search_text: Field,
}

impl SearchEngine {
    fn open(index_path: &str) -> Result<Self> {
        fs::create_dir_all(index_path).map_err(to_error)?;
        let schema = SearchSchema::build();
        let index = if Path::new(index_path).join("meta.json").exists() {
            let existing = Index::open_in_dir(index_path).map_err(to_error)?;
            if existing.schema().get_field("search_text").is_ok() {
                existing
            } else {
                fs::remove_dir_all(index_path).map_err(to_error)?;
                fs::create_dir_all(index_path).map_err(to_error)?;
                Index::create_in_dir(index_path, schema.schema.clone()).map_err(to_error)?
            }
        } else {
            Index::create_in_dir(index_path, schema.schema.clone()).map_err(to_error)?
        };
        let reader = index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommitWithDelay)
            .try_into()
            .map_err(to_error)?;
        let writer = index.writer(50_000_000).map_err(to_error)?;
        let documents_path = Path::new(index_path).join("documents.json");
        let documents = load_document_snapshot(&documents_path);
        Ok(Self {
            index,
            documents,
            documents_path,
            schema,
            reader,
            writer,
        })
    }

    fn has_documents(&self) -> Result<bool> {
        Ok(!self.documents.is_empty())
    }

    fn rebuild(&mut self, documents: Vec<SearchDocument>) -> Result<()> {
        self.writer.delete_all_documents().map_err(to_error)?;
        self.documents = documents;
        let documents_to_index = self.documents.clone();
        for document in documents_to_index {
            self.add_document(document)?;
        }
        self.commit()?;
        self.save_documents()
    }

    fn upsert_document(&mut self, document: SearchDocument) -> Result<()> {
        self.remove_document(&document.path)?;
        self.add_document(document.clone())?;
        self.documents.push(document);
        self.commit()?;
        self.save_documents()
    }

    fn remove_document(&mut self, path: &str) -> Result<()> {
        self.writer
            .delete_term(Term::from_field_text(self.schema.path, path));
        self.documents.retain(|document| document.path != path);
        self.commit()?;
        self.save_documents()
    }

    fn remove_path_prefix(&mut self, prefix: &str) -> Result<()> {
        let normalized = prefix.trim_end_matches('/');
        if normalized.is_empty() {
            return Ok(());
        }
        let parser = QueryParser::for_index(&self.index, vec![self.schema.path]);
        let escaped = normalized.replace('"', "\\\"");
        let query = parser
            .parse_query(&format!("path:\"{}*\"", escaped))
            .map_err(to_error)?;
        self.writer.delete_query(query).map_err(to_error)?;
        self.documents.retain(|document| !path_matches_prefix(&document.path, normalized));
        self.commit()?;
        self.save_documents()
    }

    fn search(&self, query: &str, limit: u32) -> Result<Vec<SearchResult>> {
        let query = query.trim();
        if query.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }

        let terms = query_tokens(query);
        if terms.is_empty() {
            return Ok(Vec::new());
        }
        let parser = QueryParser::for_index(
            &self.index,
            vec![self.schema.search_text],
        );
        let query_text = terms
            .iter()
            .map(|token| format!("{}*", token))
            .collect::<Vec<_>>()
            .join(" AND ");
        let Ok(parsed) = parser.parse_query(&query_text) else {
            return Ok(self.search_document_snapshot(&terms, limit));
        };
        let searcher = self.reader.searcher();
        let top_docs = searcher
            .search(&parsed, &TopDocs::with_limit(limit.min(100) as usize))
            .map_err(to_error)?;

        let mut results = Vec::with_capacity(top_docs.len());
        for (score, address) in top_docs {
            let document = searcher.doc(address).map_err(to_error)?;
            let path = field_text(&document, self.schema.path).unwrap_or_default();
            let title = file_label(&path);
            let content = field_text(&document, self.schema.content).unwrap_or_default();
            let snippet = best_snippet(&path, &content, &title, &terms);
            results.push(SearchResult {
                path,
                title,
                line: snippet.line,
                column: snippet.column,
                end_column: snippet.end_column,
                snippet: snippet.snippet,
                snippet_highlights: snippet.highlights,
                score: score as f64,
            });
        }
        if results.is_empty() {
            return Ok(self.search_document_snapshot(&terms, limit));
        }
        Ok(results)
    }

    fn add_document(&mut self, document: SearchDocument) -> Result<()> {
        self.writer
            .add_document(doc!(
                self.schema.path => document.path,
                self.schema.title => document.title,
                self.schema.body => fold_text(&document.content),
                self.schema.content => document.content.clone(),
                self.schema.search_text => format!(
                    "{}\n{}\n{}",
                    fold_text(&document.path),
                    fold_text(&file_label(&document.path)),
                    fold_text(&document.content),
                ),
            ))
            .map_err(to_error)?;
        Ok(())
    }

    fn commit(&mut self) -> Result<()> {
        self.writer.commit().map_err(to_error)?;
        self.reader.reload().map_err(to_error)?;
        Ok(())
    }

    fn save_documents(&self) -> Result<()> {
        let content = serde_json::to_vec(&self.documents).map_err(to_error)?;
        fs::write(&self.documents_path, content).map_err(to_error)
    }

    fn search_document_snapshot(&self, terms: &[String], limit: u32) -> Vec<SearchResult> {
        let mut results = self
            .documents
            .iter()
            .filter_map(|document| search_snapshot_document(document, terms))
            .collect::<Vec<_>>();
        results.sort_by(|left, right| {
            right
                .score
                .partial_cmp(&left.score)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| left.path.cmp(&right.path))
                .then_with(|| left.line.cmp(&right.line))
                .then_with(|| left.column.cmp(&right.column))
        });
        results.truncate(limit.min(100) as usize);
        results
    }
}

impl SearchSchema {
    fn build() -> Self {
        let mut builder = Schema::builder();
        let path = builder.add_text_field("path", TEXT | STORED);
        let title = builder.add_text_field("title", TEXT | STORED);
        let body = builder.add_text_field("body", TEXT);
        let content = builder.add_text_field("content", STORED);
        let search_text = builder.add_text_field("search_text", TEXT);
        let schema = builder.build();
        Self {
            schema,
            path,
            title,
            body,
            content,
            search_text,
        }
    }
}

struct Snippet {
    line: u32,
    column: u32,
    end_column: u32,
    snippet: String,
    highlights: Vec<SearchHighlight>,
}

fn best_snippet(path: &str, content: &str, title: &str, terms: &[String]) -> Snippet {
    let mut fallback = None;
    for (index, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if fallback.is_none() && !trimmed.is_empty() {
            fallback = Some(trimmed.to_string());
        }
        let folded = fold_text(line);
        let Some((start, end)) = first_match(&folded, terms) else {
            continue;
        };
        return snippet_from_line(line, index as u32 + 1, start, end, terms);
    }

    let text = fallback.unwrap_or_else(|| file_label(path).trim().to_string());
    let text = if text.is_empty() { title.to_string() } else { text };
    snippet_from_line(&text, 1, 0, text.chars().count().max(1), terms)
}

fn snippet_from_line(
    line: &str,
    line_number: u32,
    match_start: usize,
    match_end: usize,
    terms: &[String],
) -> Snippet {
    let chars: Vec<char> = line.chars().collect();
    let line_len = chars.len();
    let window = line_len.min(180);
    let start = match_start.saturating_sub(70).min(line_len.saturating_sub(window));
    let end = (start + window).min(line_len);
    let snippet: String = chars[start..end].iter().collect::<String>().trim().to_string();
    let folded_snippet = fold_text(&snippet);
    Snippet {
        line: line_number,
        column: match_start as u32 + 1,
        end_column: match_end.max(match_start + 1) as u32 + 1,
        snippet,
        highlights: find_highlights(&folded_snippet, terms),
    }
}

fn parse_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(fold_text)
        .filter(|term| !term.is_empty())
        .collect()
}

fn query_tokens(query: &str) -> Vec<String> {
    let folded = fold_text(query);
    let mut tokens = Vec::new();
    let mut current = String::new();
    for character in folded.chars() {
        if character.is_alphanumeric() || character == '_' {
            current.push(character);
        } else if !current.is_empty() {
            tokens.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    tokens
}

fn search_snapshot_document(document: &SearchDocument, terms: &[String]) -> Option<SearchResult> {
    let title = file_label(&document.path);
    let folded_path = fold_text(&document.path);
    let folded_title = fold_text(&title);
    let folded_content = fold_text(&document.content);
    let matches_all = terms.iter().all(|term| {
        folded_path.contains(term) || folded_title.contains(term) || folded_content.contains(term)
    });
    if !matches_all {
        return None;
    }
    let snippet = best_snippet(&document.path, &document.content, &title, terms);
    let path_title_bonus = terms
        .iter()
        .filter(|term| folded_path.contains(*term) || folded_title.contains(*term))
        .count() as f64
        * 18.0;
    Some(SearchResult {
        path: document.path.clone(),
        title,
        line: snippet.line,
        column: snippet.column,
        end_column: snippet.end_column,
        snippet: snippet.snippet,
        snippet_highlights: snippet.highlights,
        score: path_title_bonus + 1.0,
    })
}

fn first_match(text: &str, terms: &[String]) -> Option<(usize, usize)> {
    terms
        .iter()
        .filter_map(|term| text.find(term).map(|start| (start, start + term.chars().count())))
        .min_by_key(|(start, _)| *start)
}

fn find_highlights(text: &str, terms: &[String]) -> Vec<SearchHighlight> {
    let mut ranges = Vec::new();
    for term in terms {
        let mut from = 0;
        while from <= text.len() {
            let Some(index) = text[from..].find(term).map(|offset| from + offset) else {
                break;
            };
            ranges.push(SearchHighlight {
                start: index as u32,
                end: (index + term.chars().count()) as u32,
            });
            from = index + term.len().max(1);
        }
    }
    ranges.sort_by_key(|range| (range.start, range.end));
    ranges
}

fn path_matches_prefix(path: &str, prefix: &str) -> bool {
    path == prefix || path.starts_with(&format!("{}/", prefix))
}

fn load_document_snapshot(path: &Path) -> Vec<SearchDocument> {
    fs::read(path)
        .ok()
        .and_then(|content| serde_json::from_slice(&content).ok())
        .unwrap_or_default()
}

fn fold_text(value: &str) -> String {
    value
        .nfkd()
        .filter(|value| !is_combining_mark(*value))
        .collect::<String>()
        .nfkc()
        .collect::<String>()
        .to_lowercase()
}

fn file_label(path: &str) -> String {
    let file_name = path
        .rsplit(['/', '\\'])
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or(path);
    file_name
        .strip_suffix(".md")
        .or_else(|| file_name.strip_suffix(".markdown"))
        .unwrap_or(file_name)
        .to_string()
}

fn field_text(document: &tantivy::TantivyDocument, field: Field) -> Option<String> {
    document
        .get_first(field)
        .and_then(|value| value.as_str())
        .map(ToString::to_string)
}

fn to_error(error: impl std::fmt::Display) -> Error {
    Error::from_reason(error.to_string())
}
