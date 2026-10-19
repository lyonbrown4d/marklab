use crate::error::{BackendError, BackendResult};

pub fn select(value: Option<&str>, length: u64) -> BackendResult<Option<(u64, u64)>> {
  let Some(value) = value else {
    return Ok(None);
  };
  let invalid = || BackendError::new("INVALID_RANGE", "Requested byte range is unavailable");
  let range = value.strip_prefix("bytes=").ok_or_else(invalid)?;
  let (start, end) = range.split_once('-').ok_or_else(invalid)?;
  if length == 0 || range.contains(',') {
    return Err(invalid());
  }
  if start.is_empty() {
    let suffix: u64 = end.parse().map_err(|_| invalid())?;
    if suffix == 0 {
      return Err(invalid());
    }
    return Ok(Some((length.saturating_sub(suffix), length - 1)));
  }
  let start: u64 = start.parse().map_err(|_| invalid())?;
  let end = if end.is_empty() {
    length - 1
  } else {
    end.parse().map_err(|_| invalid())?
  };
  if start >= length || end < start {
    return Err(invalid());
  }
  Ok(Some((start, end.min(length - 1))))
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn supports_pdf_seek_and_media_suffix_ranges_without_full_read_fallback() {
    assert_eq!(select(Some("bytes=50-99"), 80).unwrap(), Some((50, 79)));
    assert_eq!(select(Some("bytes=-10"), 80).unwrap(), Some((70, 79)));
    assert_eq!(select(Some("bytes=20-"), 80).unwrap(), Some((20, 79)));
    for value in ["bytes=80-", "bytes=-0", "bytes=2-1", "bytes=1-2,4-5"] {
      assert!(select(Some(value), 80).is_err());
    }
    assert!(select(Some("bytes=0-"), 0).is_err());
    assert_eq!(select(None, 0).unwrap(), None);
  }
}
