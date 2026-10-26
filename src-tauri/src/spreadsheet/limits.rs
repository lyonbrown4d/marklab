use super::{ReadPageRequest, SpreadsheetPage};
use crate::error::{BackendError, BackendResult};

pub const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
#[cfg(test)]
pub use marklab_document::spreadsheet::MAX_XML_BYTES;
pub const MAX_COLUMNS: usize = 256;
pub const MAX_ROWS: usize = 500;
pub const DEFAULT_ROWS: usize = 200;
pub const MAX_CELL_BYTES: usize = 4096;
pub const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
pub const MAX_WORKBOOK_CELLS: usize = 500_000;
pub const MAX_LOGICAL_ROWS: usize = 1_048_576;

pub fn error(message: &str) -> BackendError {
  BackendError::new("SPREADSHEET_LIMIT", message)
}

pub fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_SPREADSHEET", message)
}

pub fn validate(request: &ReadPageRequest) -> BackendResult<()> {
  if request.path.is_empty() || request.path.len() > 32768 || request.path.contains('\0') {
    return Err(BackendError::new(
      "INVALID_PATH",
      "Invalid spreadsheet path",
    ));
  }
  if request.source.is_some() && request.asset_url.is_some() {
    return Err(invalid("Choose either editor content or a snapshot"));
  }
  if request
    .source
    .as_ref()
    .is_some_and(|source| source.len() as u64 > MAX_FILE_BYTES)
  {
    return Err(error(
      "Spreadsheet content exceeds the 16 MiB preview limit",
    ));
  }
  if request
    .asset_url
    .as_ref()
    .is_some_and(|url| url.len() > 1024)
  {
    return Err(invalid("Invalid spreadsheet snapshot capability"));
  }
  if request
    .sheet
    .as_ref()
    .is_some_and(|sheet| sheet.is_empty() || sheet.len() > 1024)
  {
    return Err(invalid("Invalid worksheet name"));
  }
  if request
    .limit
    .is_some_and(|limit| limit == 0 || limit > MAX_ROWS)
    || request
      .offset
      .is_some_and(|offset| offset > MAX_LOGICAL_ROWS)
  {
    return Err(invalid("Spreadsheet page is outside the supported range"));
  }
  Ok(())
}

pub fn append_cell(value: &str, bytes: &mut usize, truncated: &mut bool) -> String {
  let allowance = MAX_CELL_BYTES.min(MAX_OUTPUT_BYTES.saturating_sub(*bytes));
  let mut end = value.len().min(allowance);
  while !value.is_char_boundary(end) {
    end -= 1;
  }
  *bytes += end;
  *truncated |= end < value.len();
  value[..end].to_owned()
}

pub fn check_offset(page: &SpreadsheetPage) -> BackendResult<()> {
  if page.offset > page.total_rows {
    return Err(invalid("Spreadsheet page starts after the last row"));
  }
  Ok(())
}
