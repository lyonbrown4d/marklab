use std::fs;
use std::path::PathBuf;

use redb::{Database, ReadableDatabase, ReadableTable, TableDefinition, WriteTransaction};
use serde::{Deserialize, Serialize};

pub(crate) const OUTBOX_TABLE: TableDefinition<u64, &str> = TableDefinition::new("outbox_events");
pub(crate) const OUTBOX_COUNTER_TABLE: TableDefinition<&str, u64> =
  TableDefinition::new("outbox_counters");
const NEXT_EVENT_ID_KEY: &str = "next_event_id";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum OutboxEventKind {
  Rebuild,
  Upsert { path: String },
  Remove { path: String },
  RemovePrefix { prefix: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutboxEvent {
  pub id: u64,
  pub kind: OutboxEventKind,
  pub created_ms: u64,
  pub applied_ms: Option<u64>,
}

#[allow(dead_code)]
pub struct Outbox {
  database: Database,
}

#[allow(dead_code)]
impl Outbox {
  pub fn open(path: impl Into<PathBuf>) -> Result<Self, String> {
    let path = path.into();
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).map_err(to_message)?;
    }

    let database = Database::create(path).map_err(to_message)?;
    initialize(&database)?;

    Ok(Self { database })
  }

  pub fn append(&self, kind: OutboxEventKind, created_ms: u64) -> Result<OutboxEvent, String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let id = next_event_id(&write)?;
    let event = OutboxEvent {
      id,
      kind,
      created_ms,
      applied_ms: None,
    };
    let payload = serde_json::to_string(&event).map_err(to_message)?;
    {
      let mut table = write.open_table(OUTBOX_TABLE).map_err(to_message)?;
      table.insert(id, payload.as_str()).map_err(to_message)?;
    }
    write.commit().map_err(to_message)?;

    Ok(event)
  }

  pub fn list_pending(&self) -> Result<Vec<OutboxEvent>, String> {
    let read = self.database.begin_read().map_err(to_message)?;
    let table = read.open_table(OUTBOX_TABLE).map_err(to_message)?;
    let mut events = Vec::new();

    for entry in table.iter().map_err(to_message)? {
      let (_id, payload) = entry.map_err(to_message)?;
      let event = serde_json::from_str::<OutboxEvent>(payload.value()).map_err(to_message)?;
      if event.applied_ms.is_none() {
        events.push(event);
      }
    }

    Ok(events)
  }

  pub fn mark_applied(&self, id: u64, applied_ms: u64) -> Result<bool, String> {
    let write = self.database.begin_write().map_err(to_message)?;
    let marked = {
      let mut table = write.open_table(OUTBOX_TABLE).map_err(to_message)?;
      let payload = table
        .get(id)
        .map_err(to_message)?
        .map(|value| value.value().to_string());
      let Some(payload) = payload else {
        return Ok(false);
      };
      let mut event = serde_json::from_str::<OutboxEvent>(&payload).map_err(to_message)?;
      event.applied_ms = Some(applied_ms);
      let updated = serde_json::to_string(&event).map_err(to_message)?;
      table.insert(id, updated.as_str()).map_err(to_message)?;
      true
    };
    write.commit().map_err(to_message)?;

    Ok(marked)
  }
}

fn initialize(database: &Database) -> Result<(), String> {
  let write = database.begin_write().map_err(to_message)?;
  {
    let _table = write.open_table(OUTBOX_TABLE).map_err(to_message)?;
  }
  {
    let mut counters = write.open_table(OUTBOX_COUNTER_TABLE).map_err(to_message)?;
    if counters
      .get(NEXT_EVENT_ID_KEY)
      .map_err(to_message)?
      .is_none()
    {
      counters.insert(NEXT_EVENT_ID_KEY, 1).map_err(to_message)?;
    }
  }
  write.commit().map_err(to_message)
}

pub(crate) fn initialize_outbox_tables(database: &Database) -> Result<(), String> {
  initialize(database)
}

pub(crate) fn append_in_tx(
  write: &WriteTransaction,
  kind: OutboxEventKind,
  created_ms: u64,
) -> Result<OutboxEvent, String> {
  let id = next_event_id(write)?;
  let event = OutboxEvent {
    id,
    kind,
    created_ms,
    applied_ms: None,
  };
  let payload = serde_json::to_string(&event).map_err(to_message)?;
  let mut table = write.open_table(OUTBOX_TABLE).map_err(to_message)?;
  table.insert(id, payload.as_str()).map_err(to_message)?;

  Ok(event)
}

pub(crate) fn mark_applied_in_tx(
  write: &WriteTransaction,
  id: u64,
  applied_ms: u64,
) -> Result<bool, String> {
  let mut table = write.open_table(OUTBOX_TABLE).map_err(to_message)?;
  let payload = table
    .get(id)
    .map_err(to_message)?
    .map(|value| value.value().to_string());
  let Some(payload) = payload else {
    return Ok(false);
  };
  let mut event = serde_json::from_str::<OutboxEvent>(&payload).map_err(to_message)?;
  event.applied_ms = Some(applied_ms);
  let updated = serde_json::to_string(&event).map_err(to_message)?;
  table.insert(id, updated.as_str()).map_err(to_message)?;

  Ok(true)
}

fn next_event_id(write: &redb::WriteTransaction) -> Result<u64, String> {
  let mut counters = write.open_table(OUTBOX_COUNTER_TABLE).map_err(to_message)?;
  let id = counters
    .get(NEXT_EVENT_ID_KEY)
    .map_err(to_message)?
    .map(|value| value.value())
    .unwrap_or(1);
  let next_id = id
    .checked_add(1)
    .ok_or_else(|| "Outbox event id overflow".to_string())?;
  counters
    .insert(NEXT_EVENT_ID_KEY, next_id)
    .map_err(to_message)?;

  Ok(id)
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
  fn appends_and_lists_pending_events_in_order() {
    let outbox = Outbox::open(unique_test_path("outbox-append")).expect("open outbox");

    let first = outbox
      .append(OutboxEventKind::Rebuild, 100)
      .expect("append rebuild");
    let second = outbox
      .append(
        OutboxEventKind::Upsert {
          path: "notes/a.md".to_string(),
        },
        200,
      )
      .expect("append upsert");
    let pending = outbox.list_pending().expect("list pending");

    assert_eq!(first.id, 1);
    assert_eq!(second.id, 2);
    assert_eq!(pending, vec![first, second]);
  }

  #[test]
  fn marks_event_applied_and_hides_it_from_pending() {
    let outbox = Outbox::open(unique_test_path("outbox-apply")).expect("open outbox");
    let remove = outbox
      .append(
        OutboxEventKind::Remove {
          path: "notes/a.md".to_string(),
        },
        100,
      )
      .expect("append remove");
    let remove_prefix = outbox
      .append(
        OutboxEventKind::RemovePrefix {
          prefix: "notes/archive/".to_string(),
        },
        200,
      )
      .expect("append remove prefix");

    assert!(outbox.mark_applied(remove.id, 300).expect("mark applied"));
    let pending = outbox.list_pending().expect("list pending");

    assert_eq!(pending, vec![remove_prefix]);
  }

  #[test]
  fn mark_applied_returns_false_for_missing_event() {
    let outbox = Outbox::open(unique_test_path("outbox-missing")).expect("open outbox");

    assert!(!outbox.mark_applied(42, 300).expect("mark missing applied"));
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
