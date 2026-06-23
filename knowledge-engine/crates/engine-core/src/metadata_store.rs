use std::fs;
use std::path::PathBuf;

use redb::{Database, ReadableDatabase, ReadableTable, TableDefinition, WriteTransaction};
use serde::{Deserialize, Serialize};

pub(crate) const DOCUMENT_METADATA_TABLE: TableDefinition<&str, &str> =
  TableDefinition::new("document_metadata");

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentMetadata {
  pub path: String,
  pub title: String,
  pub content_hash: String,
  pub modified_ms: Option<u64>,
  pub indexed_revision: u64,
}

#[allow(dead_code)]
pub struct MetadataStore {
  database: Database,
}

#[allow(dead_code)]
impl MetadataStore {
  pub fn open(path: impl Into<PathBuf>) -> Result<Self, String> {
    let path = path.into();
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(to_message)?;
    }

    let database = Database::create(path).map_err(to_message)?;
    initialize(&database)?;

    Ok(Self { database })
  }

  pub fn upsert_document(&self, metadata: &DocumentMetadata) -> Result<(), String> {
    let payload = serde_json::to_string(metadata).map_err(to_message)?;
    let write = self.database.begin_write().map_err(to_message)?;
    {
      let mut table = write
        .open_table(DOCUMENT_METADATA_TABLE)
        .map_err(to_message)?;
      table
        .insert(metadata.path.as_str(), payload.as_str())
        .map_err(to_message)?;
    }
    write.commit().map_err(to_message)
  }

  pub fn get_document(&self, path: &str) -> Result<Option<DocumentMetadata>, String> {
    get_document_in_db(&self.database, path)
  }

  pub fn list_documents(&self) -> Result<Vec<DocumentMetadata>, String> {
    list_documents_in_db(&self.database)
  }

  pub fn remove_document(&self, path: &str) -> Result<bool, String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let removed = {
      let mut table = write
        .open_table(DOCUMENT_METADATA_TABLE)
        .map_err(to_message)?;
      let removed = table.remove(path).map_err(to_message)?.is_some();
      removed
    };
    write.commit().map_err(to_message)?;

    Ok(removed)
  }

  pub fn remove_path_prefix(&self, prefix: &str) -> Result<usize, String> {
    let paths = self
      .list_documents()?
      .into_iter()
      .map(|metadata| metadata.path)
      .filter(|path| path.starts_with(prefix))
      .collect::<Vec<_>>();
    let write = self.database.begin_write().map_err(to_message)?;
    {
      let mut table = write
        .open_table(DOCUMENT_METADATA_TABLE)
        .map_err(to_message)?;
      for path in &paths {
        table.remove(path.as_str()).map_err(to_message)?;
      }
    }
    write.commit().map_err(to_message)?;

    Ok(paths.len())
  }
}

fn initialize(database: &Database) -> Result<(), String> {
  let write = database.begin_write().map_err(to_message)?;
  {
    let _table = write
      .open_table(DOCUMENT_METADATA_TABLE)
      .map_err(to_message)?;
  }
  write.commit().map_err(to_message)
}

pub(crate) fn initialize_metadata_tables(database: &Database) -> Result<(), String> {
  initialize(database)
}

pub(crate) fn get_document_in_db(
  database: &Database,
  path: &str,
) -> Result<Option<DocumentMetadata>, String> {
  let read = database.begin_read().map_err(to_message)?;
  let table = read
    .open_table(DOCUMENT_METADATA_TABLE)
    .map_err(to_message)?;
  let Some(payload) = table.get(path).map_err(to_message)? else {
    return Ok(None);
  };

  serde_json::from_str(payload.value())
    .map(Some)
    .map_err(to_message)
}

pub(crate) fn list_documents_in_db(database: &Database) -> Result<Vec<DocumentMetadata>, String> {
  let read = database.begin_read().map_err(to_message)?;
  let table = read
    .open_table(DOCUMENT_METADATA_TABLE)
    .map_err(to_message)?;
  let mut documents = Vec::new();

  for entry in table.iter().map_err(to_message)? {
    let (_path, payload) = entry.map_err(to_message)?;
    documents.push(serde_json::from_str(payload.value()).map_err(to_message)?);
  }

  Ok(documents)
}

pub(crate) fn upsert_document_in_tx(
  write: &WriteTransaction,
  metadata: &DocumentMetadata,
) -> Result<(), String> {
  let payload = serde_json::to_string(metadata).map_err(to_message)?;
  let mut table = write
    .open_table(DOCUMENT_METADATA_TABLE)
    .map_err(to_message)?;
  table
    .insert(metadata.path.as_str(), payload.as_str())
    .map_err(to_message)?;

  Ok(())
}

pub(crate) fn remove_document_in_tx(write: &WriteTransaction, path: &str) -> Result<bool, String> {
  let mut table = write
    .open_table(DOCUMENT_METADATA_TABLE)
    .map_err(to_message)?;
  let removed = table.remove(path).map_err(to_message)?.is_some();
  Ok(removed)
}

pub(crate) fn remove_path_prefix_in_tx(
  write: &WriteTransaction,
  prefix: &str,
) -> Result<usize, String> {
  let mut table = write
    .open_table(DOCUMENT_METADATA_TABLE)
    .map_err(to_message)?;
  let paths = table
    .iter()
    .map_err(to_message)?
    .filter_map(|entry| {
      entry
        .ok()
        .map(|(path, _payload)| path.value().to_string())
        .filter(|path| path.starts_with(prefix))
    })
    .collect::<Vec<_>>();

  for path in &paths {
    table.remove(path.as_str()).map_err(to_message)?;
  }

  Ok(paths.len())
}

fn to_message(error: impl std::fmt::Display) -> String {
  error.to_string()
}

#[cfg(test)]
mod tests {
  use std::fs;
  use std::path::PathBuf;
  use std::time::{SystemTime, UNIX_EPOCH};

  use super::*;

  #[test]
  fn upserts_and_reads_document_metadata() {
    let store = MetadataStore::open(unique_test_path("metadata-upsert")).expect("open store");
    let metadata = document_metadata("notes/a.md", "Alpha", "hash-a", Some(100), 7);

    store.upsert_document(&metadata).expect("upsert metadata");
    let stored = store
      .get_document("notes/a.md")
      .expect("read metadata")
      .expect("metadata exists");

    assert_eq!(stored, metadata);
  }

  #[test]
  fn lists_and_removes_metadata_by_prefix() {
    let store = MetadataStore::open(unique_test_path("metadata-prefix")).expect("open store");
    store
      .upsert_document(&document_metadata("notes/a.md", "Alpha", "hash-a", None, 1))
      .expect("upsert first metadata");
    store
      .upsert_document(&document_metadata(
        "notes/nested/b.md",
        "Beta",
        "hash-b",
        None,
        2,
      ))
      .expect("upsert second metadata");
    store
      .upsert_document(&document_metadata("tasks/c.md", "Gamma", "hash-c", None, 3))
      .expect("upsert third metadata");

    let removed = store
      .remove_path_prefix("notes/")
      .expect("remove metadata prefix");
    let remaining = store.list_documents().expect("list metadata");

    assert_eq!(removed, 2);
    assert_eq!(remaining.len(), 1);
    assert_eq!(remaining[0].path, "tasks/c.md");
  }

  #[test]
  fn removes_single_document_metadata() {
    let store = MetadataStore::open(unique_test_path("metadata-remove")).expect("open store");
    store
      .upsert_document(&document_metadata("notes/a.md", "Alpha", "hash-a", None, 1))
      .expect("upsert metadata");

    assert!(store
      .remove_document("notes/a.md")
      .expect("remove metadata"));
    assert!(!store
      .remove_document("notes/a.md")
      .expect("remove missing metadata"));
    assert!(store
      .get_document("notes/a.md")
      .expect("read missing metadata")
      .is_none());
  }

  fn document_metadata(
    path: &str,
    title: &str,
    content_hash: &str,
    modified_ms: Option<u64>,
    indexed_revision: u64,
  ) -> DocumentMetadata {
    DocumentMetadata {
      path: path.to_string(),
      title: title.to_string(),
      content_hash: content_hash.to_string(),
      modified_ms,
      indexed_revision,
    }
  }

  fn unique_test_path(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .expect("system time after unix epoch")
      .as_nanos();
    let path = std::env::temp_dir().join(format!("marklab-engine-core-{label}-{nanos}.redb"));
    let _ = fs::remove_file(&path);
    path
  }
}
