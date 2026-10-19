use super::types::BufferUpdate;
use crate::error::{BackendError, BackendResult};
pub(super) const MAX_DOCUMENT_BYTES: usize = 64 * 1024 * 1024;

pub(super) fn apply(source: &str, update: BufferUpdate) -> BackendResult<String> {
  let next = match update {
    BufferUpdate::Snapshot { content } => content,
    BufferUpdate::Patch { changes } => {
      if changes.is_empty() || changes.len() > 1000 {
        return Err(BackendError::new(
          "INVALID_REQUEST",
          "Invalid buffer patch length",
        ));
      }
      let source: Vec<u16> = source.encode_utf16().collect();
      let mut result = Vec::new();
      let mut previous = 0;
      let mut inserted: usize = 0;
      for change in changes {
        let end = change
          .offset
          .checked_add(change.delete_length)
          .ok_or_else(|| BackendError::new("INVALID_REQUEST", "Buffer patch range overflow"))?;
        if change.offset < previous || end > source.len() {
          return Err(BackendError::new(
            "INVALID_REQUEST",
            "Buffer patch ranges overlap or exceed document",
          ));
        }
        // Both boundaries must be Unicode scalar boundaries, even if a
        // replacement would otherwise happen to reconstruct a surrogate pair.
        for boundary in [change.offset, end] {
          if boundary > 0
            && boundary < source.len()
            && (0xD800..=0xDBFF).contains(&source[boundary - 1])
            && (0xDC00..=0xDFFF).contains(&source[boundary])
          {
            return Err(BackendError::new(
              "INVALID_REQUEST",
              "Buffer patch splits a Unicode character",
            ));
          }
        }
        inserted = inserted.saturating_add(change.insert_text.encode_utf16().count());
        if inserted > 1_048_576 {
          return Err(BackendError::new(
            "INVALID_REQUEST",
            "Buffer patch is too large",
          ));
        }
        result.extend_from_slice(&source[previous..change.offset]);
        result.extend(change.insert_text.encode_utf16());
        previous = end;
      }
      result.extend_from_slice(&source[previous..]);
      String::from_utf16(&result)
        .map_err(|_| BackendError::new("INVALID_REQUEST", "Invalid Unicode buffer patch"))?
    }
  };
  if next.len() > MAX_DOCUMENT_BYTES {
    return Err(BackendError::new(
      "FILE_TOO_LARGE",
      "Document exceeds text editor limit",
    ));
  }
  Ok(next)
}
