use std::fs;
use std::path::{Path, PathBuf};

use redb::{Database, ReadableDatabase, TableDefinition};
use tantivy::collector::TopDocs;
use tantivy::query::AllQuery;
use tantivy::schema::{Field, Schema, Value, STORED, STRING, TEXT};
use tantivy::{doc, Index, IndexReader, IndexWriter, TantivyDocument, Term};

use crate::search_text::search_documents;
use crate::types::SearchDocument;

const METADATA_TABLE: TableDefinition<&str, u64> = TableDefinition::new("metadata");
const DOCUMENT_COUNT_KEY: &str = "document_count";
const SEARCH_WRITER_MEMORY_BYTES: usize = 15_000_000;
const MAX_MANUAL_SCAN_DOCS: usize = 50_000;

pub(crate) struct WorkspaceStore {
  metadata: Database,
  search: TantivyWorkspaceIndex,
}

impl WorkspaceStore {
  pub(crate) fn open(index_path: impl Into<PathBuf>) -> Result<Self, String> {
    let index_path = index_path.into();
    fs::create_dir_all(&index_path).map_err(to_message)?;
    let metadata = Database::create(index_path.join("metadata.redb")).map_err(to_message)?;
    initialize_metadata(&metadata)?;
    let search = TantivyWorkspaceIndex::open(index_path.join("tantivy"))?;

    Ok(Self { metadata, search })
  }

  pub(crate) fn document_count(&self) -> Result<usize, String> {
    read_document_count(&self.metadata)
  }

  pub(crate) fn has_documents(&self) -> Result<bool, String> {
    Ok(self.document_count()? > 0)
  }

  pub(crate) fn rebuild(&self, documents: &[SearchDocument]) -> Result<usize, String> {
    self.search.rebuild(documents)?;
    let count = self.search.document_count()?;
    write_document_count(&self.metadata, count)?;
    Ok(count)
  }

  pub(crate) fn upsert_document(&self, document: &SearchDocument) -> Result<usize, String> {
    self.search.upsert_document(document)?;
    let count = self.search.document_count()?;
    write_document_count(&self.metadata, count)?;
    Ok(count)
  }

  pub(crate) fn remove_document(&self, path: &str) -> Result<usize, String> {
    self.search.remove_document(path)?;
    let count = self.search.document_count()?;
    write_document_count(&self.metadata, count)?;
    Ok(count)
  }

  pub(crate) fn remove_path_prefix(&self, prefix: &str) -> Result<usize, String> {
    self.search.remove_path_prefix(prefix)?;
    let count = self.search.document_count()?;
    write_document_count(&self.metadata, count)?;
    Ok(count)
  }

  pub(crate) fn search(&self, query: &str, limit: usize) -> Result<Vec<serde_json::Value>, String> {
    self.search.search(query, limit)
  }
}

fn initialize_metadata(database: &Database) -> Result<(), String> {
  let write = database.begin_write().map_err(to_message)?;
  {
    let _table = write.open_table(METADATA_TABLE).map_err(to_message)?;
  }
  write.commit().map_err(to_message)
}

fn read_document_count(database: &Database) -> Result<usize, String> {
  let read = database.begin_read().map_err(to_message)?;
  let table = read.open_table(METADATA_TABLE).map_err(to_message)?;
  let value = table.get(DOCUMENT_COUNT_KEY).map_err(to_message)?;

  Ok(value.map(|count| count.value() as usize).unwrap_or(0))
}

fn write_document_count(database: &Database, count: usize) -> Result<(), String> {
  let write = database.begin_write().map_err(to_message)?;
  {
    let mut table = write.open_table(METADATA_TABLE).map_err(to_message)?;
    table
      .insert(DOCUMENT_COUNT_KEY, count as u64)
      .map_err(to_message)?;
  }
  write.commit().map_err(to_message)
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

  fn search(&self, query: &str, limit: usize) -> Result<Vec<serde_json::Value>, String> {
    let documents = self.all_documents()?;
    Ok(search_documents(documents.iter(), query, limit))
  }

  fn document_count(&self) -> Result<usize, String> {
    self.reader.reload().map_err(to_message)?;
    Ok(self.reader.searcher().num_docs() as usize)
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

fn to_message(error: impl std::fmt::Display) -> String {
  error.to_string()
}
