use std::fs;
use std::path::Path;
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
        Ok(Self {
            index,
            schema,
            reader,
            writer,
        })
    }

    fn has_documents(&self) -> Result<bool> {
        let searcher = self.reader.searcher();
        Ok(searcher.num_docs() > 0)
    }

    fn rebuild(&mut self, documents: Vec<SearchDocument>) -> Result<()> {
        self.writer.delete_all_documents().map_err(to_error)?;
        for document in documents {
            self.add_document(document)?;
        }
        self.commit()
    }

    fn upsert_document(&mut self, document: SearchDocument) -> Result<()> {
        self.remove_document(&document.path)?;
        self.add_document(document)?;
        self.commit()
    }

    fn remove_document(&mut self, path: &str) -> Result<()> {
        self.writer
            .delete_term(Term::from_field_text(self.schema.path, path));
        self.commit()
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
        self.commit()
    }

    fn search(&self, query: &str, limit: u32) -> Result<Vec<SearchResult>> {
        let query = query.trim();
        if query.is_empty() || limit == 0 {
            return Ok(Vec::new());
        }

        let parser = QueryParser::for_index(
            &self.index,
            vec![self.schema.search_text],
        );
        let query_text = query_tokens(query).join(" ");
        if query_text.is_empty() {
            return Ok(Vec::new());
        }
        let parsed = parser.parse_query(&query_text).map_err(to_error)?;
        let searcher = self.reader.searcher();
        let top_docs = searcher
            .search(&parsed, &TopDocs::with_limit(limit.min(100) as usize))
            .map_err(to_error)?;

        let terms = parse_terms(query);
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
