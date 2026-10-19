use super::types::{Change, Position};
use crate::error::{BackendError, BackendResult};

pub fn offset(text: &str, position: Position) -> BackendResult<usize> {
  let mut start = 0;
  let line = text
    .split('\n')
    .nth(position.line)
    .ok_or_else(|| invalid("Line is outside the document"))?;
  for previous in text.split_inclusive('\n').take(position.line) {
    start += previous.len();
  }
  let line = line.strip_suffix('\r').unwrap_or(line);
  let mut units = 0;
  for (index, character) in line.char_indices() {
    if units == position.character {
      return Ok(start + index);
    }
    units += character.len_utf16();
    if units > position.character {
      return Err(invalid("Position splits a Unicode character"));
    }
  }
  if units == position.character {
    Ok(start + line.len())
  } else {
    Err(invalid("Column is outside the document"))
  }
}

pub fn apply(text: &str, change: &Change) -> BackendResult<String> {
  let start = offset(text, change.range.start)?;
  let end = offset(text, change.range.end)?;
  if start > end {
    return Err(invalid("Document range start is after its end"));
  }
  if change
    .range_length
    .is_some_and(|length| text[start..end].encode_utf16().count() != length)
  {
    return Err(invalid("Document range length does not match its content"));
  }
  let mut output = String::with_capacity(text.len() - (end - start) + change.text.len());
  output.push_str(&text[..start]);
  output.push_str(&change.text);
  output.push_str(&text[end..]);
  Ok(output)
}
fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_REQUEST", message)
}
