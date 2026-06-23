use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use redb::Database;
use tantivy::collector::TopDocs;
use tantivy::query::AllQuery;
use tantivy::schema::{Field, Schema, Value, STORED, STRING, TEXT};
use tantivy::{doc, Index, IndexReader, IndexWriter, TantivyDocument, Term};

use crate::metadata_store::{
  get_document_in_db, initialize_metadata_tables, list_documents_in_db, remove_document_in_tx,
  remove_path_prefix_in_tx, upsert_document_in_tx, DocumentMetadata,
};
use crate::outbox::{
  append_in_tx, initialize_outbox_tables, mark_applied_in_tx, OutboxEvent, OutboxEventKind,
};
use crate::search_text::search_documents;
use crate::types::{SearchDocument, SearchOrder, SearchQuery, SearchResultSet};

const SEARCH_WRITER_MEMORY_BYTES: usize = 15_000_000;
const MAX_MANUAL_SCAN_DOCS: usize = 50_000;

pub(crate) struct WorkspaceStore {
  database: Database,
  search: TantivyWorkspaceIndex,
}

impl WorkspaceStore {
  pub(crate) fn open(index_path: impl Into<PathBuf>) -> Result<Self, String> {
    let index_path = index_path.into();
    fs::create_dir_all(&index_path).map_err(to_message)?;
    let metadata_path = index_path.join("metadata.redb");
    let database = Database::create(&metadata_path).map_err(to_message)?;
    initialize_metadata_tables(&database)?;
    initialize_outbox_tables(&database)?;
    let search = TantivyWorkspaceIndex::open(index_path.join("tantivy"))?;

    Ok(Self { database, search })
  }

  pub(crate) fn document_count(&self) -> Result<usize, String> {
    Ok(list_documents_in_db(&self.database)?.len())
  }

  pub(crate) fn has_documents(&self) -> Result<bool, String> {
    Ok(self.document_count()? > 0)
  }

  pub(crate) fn rebuild(&self, documents: &[SearchDocument]) -> Result<usize, String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let event = append_in_tx(&write, OutboxEventKind::Rebuild, current_time_ms())?;
    remove_path_prefix_in_tx(&write, "")?;
    for (index, document) in documents.iter().enumerate() {
      upsert_document_in_tx(&write, &metadata_for_document(document, (index + 1) as u64))?;
    }
    write.commit().map_err(to_message)?;

    self.search.rebuild(documents)?;
    self.mark_applied(event)?;
    let count = self.document_count()?;
    Ok(count)
  }

  pub(crate) fn upsert_document(&self, document: &SearchDocument) -> Result<usize, String> {
    let revision = self.next_revision(&document.path)?;
    let write = self.database.begin_write().map_err(to_message)?;
    let event = append_in_tx(
      &write,
      OutboxEventKind::Upsert {
        path: document.path.clone(),
      },
      current_time_ms(),
    )?;
    upsert_document_in_tx(&write, &metadata_for_document(document, revision))?;
    write.commit().map_err(to_message)?;

    self.search.upsert_document(document)?;
    self.mark_applied(event)?;
    let count = self.document_count()?;
    Ok(count)
  }

  pub(crate) fn remove_document(&self, path: &str) -> Result<usize, String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let event = append_in_tx(
      &write,
      OutboxEventKind::Remove {
        path: path.to_string(),
      },
      current_time_ms(),
    )?;
    remove_document_in_tx(&write, path)?;
    write.commit().map_err(to_message)?;

    self.search.remove_document(path)?;
    self.mark_applied(event)?;
    let count = self.document_count()?;
    Ok(count)
  }

  pub(crate) fn remove_path_prefix(&self, prefix: &str) -> Result<usize, String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let event = append_in_tx(
      &write,
      OutboxEventKind::RemovePrefix {
        prefix: prefix.to_string(),
      },
      current_time_ms(),
    )?;
    remove_path_prefix_in_tx(&write, prefix)?;
    write.commit().map_err(to_message)?;

    self.search.remove_path_prefix(prefix)?;
    self.mark_applied(event)?;
    let count = self.document_count()?;
    Ok(count)
  }

  pub(crate) fn search(&self, query: &SearchQuery) -> Result<SearchResultSet<serde_json::Value>, String> {
    let metadata = list_documents_in_db(&self.database)?;
    self.search.search(query, &metadata)
  }

  fn mark_applied(&self, event: OutboxEvent) -> Result<(), String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let marked = mark_applied_in_tx(&write, event.id, current_time_ms())?;
    write.commit().map_err(to_message)?;
    if marked {
      Ok(())
    } else {
      Err(format!("Outbox event {} was not found", event.id))
    }
  }

  fn next_revision(&self, path: &str) -> Result<u64, String> {
    Ok(
      get_document_in_db(&self.database, path)?
        .map(|metadata| metadata.indexed_revision.saturating_add(1))
        .unwrap_or(1),
    )
  }
}

struct TantivyWorkspaceIndex {
  index: Index,
  reader: IndexReader,
  fields: SearchFields,
}

#[derive(Debug, Clone, Copy)]
struct SearchFields {
  path: Field,
  title: Field,
  content: Field,
}

impl TantivyWorkspaceIndex {
  fn open(index_path: impl AsRef<Path>) -> Result<Self, String> {
    let index_path = index_path.as_ref();
    fs::create_dir_all(index_path).map_err(to_message)?;

    let index = if index_path.join("meta.json").exists() {
      Index::open_in_dir(index_path).map_err(to_message)?
    } else {
      Index::create_in_dir(index_path, create_schema()).map_err(to_message)?
    };
    let fields = fields_for_schema(index.schema())?;
    let reader = index.reader().map_err(to_message)?;

    Ok(Self {
      index,
      reader,
      fields,
    })
  }

  fn rebuild(&self, documents: &[SearchDocument]) -> Result<(), String> {
    let mut writer: IndexWriter<TantivyDocument> = self
      .index
      .writer(SEARCH_WRITER_MEMORY_BYTES)
      .map_err(to_message)?;
    writer.delete_all_documents().map_err(to_message)?;

    for document in documents {
      writer
        .add_document(self.to_tantivy_document(document))
        .map_err(to_message)?;
    }

    writer.commit().map_err(to_message)?;
    self.reader.reload().map_err(to_message)
  }

  fn upsert_document(&self, document: &SearchDocument) -> Result<(), String> {
    let mut writer: IndexWriter<TantivyDocument> = self
      .index
      .writer(SEARCH_WRITER_MEMORY_BYTES)
      .map_err(to_message)?;
    writer.delete_term(Term::from_field_text(self.fields.path, &document.path));
    writer
      .add_document(self.to_tantivy_document(document))
      .map_err(to_message)?;
    writer.commit().map_err(to_message)?;
    self.reader.reload().map_err(to_message)
  }

  fn remove_document(&self, path: &str) -> Result<(), String> {
    let mut writer: IndexWriter<TantivyDocument> = self
      .index
      .writer(SEARCH_WRITER_MEMORY_BYTES)
      .map_err(to_message)?;
    writer.delete_term(Term::from_field_text(self.fields.path, path));
    writer.commit().map_err(to_message)?;
    self.reader.reload().map_err(to_message)
  }

  fn remove_path_prefix(&self, prefix: &str) -> Result<(), String> {
    let paths = self
      .all_documents()?
      .into_iter()
      .map(|document| document.path)
      .filter(|path| path.starts_with(prefix))
      .collect::<Vec<_>>();

    let mut writer: IndexWriter<TantivyDocument> = self
      .index
      .writer(SEARCH_WRITER_MEMORY_BYTES)
      .map_err(to_message)?;
    for path in paths {
      writer.delete_term(Term::from_field_text(self.fields.path, &path));
    }
    writer.commit().map_err(to_message)?;
    self.reader.reload().map_err(to_message)
  }

  fn search(
    &self,
    query: &SearchQuery,
    metadata: &[DocumentMetadata],
  ) -> Result<SearchResultSet<serde_json::Value>, String> {
    let titles = metadata
      .iter()
      .map(|metadata| (metadata.path.as_str(), metadata.title.as_str()))
      .collect::<HashMap<_, _>>();
    let mut documents = self.all_documents()?;
    for document in &mut documents {
      if let Some(title) = titles.get(document.path.as_str()) {
        document.title = (*title).to_string();
      }
    }

    Ok(search_documents(
      documents.iter(),
      query,
    ))
  }

  fn all_documents(&self) -> Result<Vec<SearchDocument>, String> {
    let searcher = self.reader.searcher();
    let top_docs = searcher
      .search(
        &AllQuery,
        &TopDocs::with_limit(MAX_MANUAL_SCAN_DOCS).order_by_score(),
      )
      .map_err(to_message)?;
    let mut documents = Vec::with_capacity(top_docs.len());

    for (_score, address) in top_docs {
      let document: TantivyDocument = searcher.doc(address).map_err(to_message)?;
      documents.push(SearchDocument {
        path: field_text(&document, self.fields.path).unwrap_or_default(),
        title: field_text(&document, self.fields.title).unwrap_or_default(),
        content: field_text(&document, self.fields.content).unwrap_or_default(),
      });
    }

    Ok(documents)
  }

  fn to_tantivy_document(&self, document: &SearchDocument) -> TantivyDocument {
    doc!(
        self.fields.path => document.path.clone(),
        self.fields.title => document.title.clone(),
        self.fields.content => document.content.clone(),
    )
  }
}

fn create_schema() -> Schema {
  let mut builder = Schema::builder();
  builder.add_text_field("path", STRING | STORED);
  builder.add_text_field("title", TEXT | STORED);
  builder.add_text_field("content", TEXT | STORED);
  builder.build()
}

fn fields_for_schema(schema: Schema) -> Result<SearchFields, String> {
  Ok(SearchFields {
    path: schema.get_field("path").map_err(to_message)?,
    title: schema.get_field("title").map_err(to_message)?,
    content: schema.get_field("content").map_err(to_message)?,
  })
}

fn field_text(document: &TantivyDocument, field: Field) -> Option<String> {
  document
    .get_first(field)
    .and_then(|value| value.as_str())
    .map(ToOwned::to_owned)
}

fn metadata_for_document(document: &SearchDocument, indexed_revision: u64) -> DocumentMetadata {
  DocumentMetadata {
    path: document.path.clone(),
    title: document.title.clone(),
    content_hash: content_hash(document),
    modified_ms: None,
    indexed_revision,
  }
}

fn content_hash(document: &SearchDocument) -> String {
  let mut hash = 0xcbf29ce484222325_u64;
  for byte in document
    .path
    .bytes()
    .chain(document.title.bytes())
    .chain(document.content.bytes())
  {
    hash ^= u64::from(byte);
    hash = hash.wrapping_mul(0x100000001b3);
  }
  format!("{hash:016x}")
}

fn current_time_ms() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
    .unwrap_or_default()
}

fn to_message(error: impl std::fmt::Display) -> String {
  error.to_string()
}
