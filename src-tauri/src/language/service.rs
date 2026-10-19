use super::{types::*, utf16};
use crate::error::{BackendError, BackendResult};
use std::{
  collections::HashMap,
  sync::{Arc, Mutex},
};
use tokio::sync::Semaphore;

#[derive(Clone)]
pub struct Document {
  pub uri: String,
  pub path: Option<String>,
  pub language_id: String,
  pub version: u64,
  pub text: Arc<str>,
  units: usize,
  consumers: usize,
}
type Clients = HashMap<String, HashMap<String, Document>>;
pub struct LanguageService {
  clients: Arc<Mutex<Clients>>,
  workers: Arc<Semaphore>,
}
impl Default for LanguageService {
  fn default() -> Self {
    Self {
      clients: Arc::new(Mutex::new(HashMap::new())),
      workers: Arc::new(Semaphore::new(2)),
    }
  }
}

impl LanguageService {
  pub async fn run<T: Send + 'static>(
    &self,
    task: impl FnOnce() -> BackendResult<T> + Send + 'static,
  ) -> BackendResult<T> {
    let _permit = self
      .workers
      .clone()
      .acquire_owned()
      .await
      .map_err(|_| invalid("Language worker unavailable"))?;
    tokio::task::spawn_blocking(task)
      .await
      .map_err(|error| BackendError::new("LANGUAGE_FAILED", error.to_string()))?
  }

  pub async fn open(&self, owner: String, request: OpenRequest) -> BackendResult<DocumentAck> {
    let clients = self.clients.clone();
    self
      .run(move || {
        uri(&request.uri)?;
        if !["markdown", "mermaid"].contains(&request.language_id.as_str())
          || request.path.as_ref().is_some_and(|path| path.len() > 32768)
        {
          return Err(invalid("Unsupported language or invalid document path"));
        }
        let units = request.text.encode_utf16().count();
        if units > 16 * 1024 * 1024 {
          return Err(invalid("Language document exceeds the text limit"));
        }
        let mut clients = clients.lock().map_err(|_| state_error())?;
        let documents = clients.entry(owner).or_default();
        if let Some(existing) = documents.get_mut(&request.uri) {
          if existing.version != request.version
            || existing.language_id != request.language_id
            || existing.path != request.path
            || existing.text.as_ref() != request.text
          {
            return Err(invalid("Document is already open with different content"));
          }
          existing.consumers += 1;
          return Ok(DocumentAck {
            ok: true,
            version: existing.version,
          });
        }
        if documents.len() >= 128
          || documents
            .values()
            .map(|document| document.units)
            .sum::<usize>()
            + units
            > 64 * 1024 * 1024
        {
          return Err(invalid("Language documents exceed per-renderer limits"));
        }
        let version = request.version;
        documents.insert(
          request.uri.clone(),
          Document {
            uri: request.uri,
            path: request.path,
            language_id: request.language_id,
            version,
            text: request.text.into(),
            units,
            consumers: 1,
          },
        );
        Ok(DocumentAck { ok: true, version })
      })
      .await
  }

  pub async fn change(&self, owner: String, request: ChangeRequest) -> BackendResult<DocumentAck> {
    let clients = self.clients.clone();
    self
      .run(move || {
        if request.changes.is_empty() || request.changes.len() > 100 {
          return Err(invalid("Invalid document change batch"));
        }
        let sizes: Vec<_> = request
          .changes
          .iter()
          .map(|change| change.text.encode_utf16().count())
          .collect();
        if sizes.iter().any(|size| *size > 4 * 1024 * 1024)
          || sizes.iter().sum::<usize>() > 8 * 1024 * 1024
        {
          return Err(invalid("Document change batch exceeds the text limit"));
        }
        let mut clients = clients.lock().map_err(|_| state_error())?;
        let documents = clients
          .get_mut(&owner)
          .ok_or_else(|| invalid("Language document is not open"))?;
        let document = documents
          .get(&request.uri)
          .ok_or_else(|| invalid("Language document is not open"))?;
        if document.version.checked_add(1) != Some(request.version) {
          return Err(invalid("Document change must use exactly the next version"));
        }
        let mut text = document.text.to_string();
        for change in request.changes {
          text = utf16::apply(&text, &change)?;
          if text.encode_utf16().count() > 16 * 1024 * 1024 {
            return Err(invalid("Language document exceeds the text limit"));
          }
        }
        let units = text.encode_utf16().count();
        if documents
          .values()
          .map(|document| document.units)
          .sum::<usize>()
          - document.units
          + units
          > 64 * 1024 * 1024
        {
          return Err(invalid("Language documents exceed per-renderer limits"));
        }
        let document = documents
          .get_mut(&request.uri)
          .ok_or_else(|| invalid("Language document closed"))?;
        document.text = text.into();
        document.units = units;
        document.version = request.version;
        Ok(DocumentAck {
          ok: true,
          version: request.version,
        })
      })
      .await
  }

  pub async fn close(&self, owner: String, request: CloseRequest) -> BackendResult<()> {
    let clients = self.clients.clone();
    self
      .run(move || {
        let mut clients = clients.lock().map_err(|_| state_error())?;
        if let Some(documents) = clients.get_mut(&owner) {
          if let Some(document) = documents.get_mut(&request.uri) {
            if document.consumers > 1 {
              document.consumers -= 1;
            } else {
              documents.remove(&request.uri);
            }
          }
          if documents.is_empty() {
            clients.remove(&owner);
          }
        }
        Ok(())
      })
      .await
  }

  pub async fn snapshot(
    &self,
    owner: String,
    uri: String,
    version: u64,
  ) -> BackendResult<Document> {
    let clients = self.clients.clone();
    self
      .run(move || {
        let clients = clients.lock().map_err(|_| state_error())?;
        let document = clients
          .get(&owner)
          .and_then(|documents| documents.get(&uri))
          .ok_or_else(|| invalid("Language document is not open"))?;
        if document.version != version {
          return Err(invalid(
            "Language request version does not match the document",
          ));
        }
        Ok(document.clone())
      })
      .await
  }
  pub async fn close_client(&self, owner: String) -> BackendResult<()> {
    let clients = self.clients.clone();
    self
      .run(move || {
        clients.lock().map_err(|_| state_error())?.remove(&owner);
        Ok(())
      })
      .await
  }
}
fn uri(value: &str) -> BackendResult<()> {
  if value.is_empty() || value.len() > 4096 || value.contains('\0') {
    Err(invalid("Invalid language document URI"))
  } else {
    Ok(())
  }
}
fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_REQUEST", message)
}
fn state_error() -> BackendError {
  BackendError::new("STATE_ERROR", "Language session lock failed")
}
