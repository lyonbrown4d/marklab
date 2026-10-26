use crate::error::BackendError;
pub const MAX_FILE_BYTES: u64 = 16 * 1024 * 1024;
pub const MAX_INFLATED_BYTES: u64 = 32 * 1024 * 1024;
pub const MAX_XML_BYTES: u64 = 8 * 1024 * 1024;
pub const MAX_ROWS: usize = 500;
pub const MAX_COLUMNS: usize = 256;
pub const MAX_CELL_BYTES: usize = 4096;
pub const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
pub fn error(message: &str) -> BackendError {
  BackendError::new("SPREADSHEET_LIMIT", message)
}
pub fn invalid(message: &str) -> BackendError {
  BackendError::new("INVALID_SPREADSHEET", message)
}
pub fn calculation_unsupported(message: &str) -> BackendError {
  BackendError::new("SPREADSHEET_CALCULATION_UNSUPPORTED", message)
}
pub fn append(value: &str, bytes: &mut usize, truncated: &mut bool) -> String {
  let mut end = value
    .len()
    .min(MAX_CELL_BYTES.min(MAX_OUTPUT_BYTES.saturating_sub(*bytes)));
  while !value.is_char_boundary(end) {
    end -= 1;
  }
  *bytes += end;
  *truncated |= end < value.len();
  value[..end].to_owned()
}
