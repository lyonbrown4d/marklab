//! Shared read-only spreadsheet import. Formula caches are read without executing workbook code.
pub mod csv_guard;
mod limits;
#[cfg(test)]
mod tests;
mod workbook;
pub mod zip_directory;
pub mod zip_preflight;
pub mod zip_relationship;
use crate::{check_cancelled, error::BackendResult};
pub use limits::{MAX_FILE_BYTES, MAX_XML_BYTES};
use std::io::Cursor;
use tokio_util::sync::CancellationToken;

pub struct Sheet {
  pub name: String,
  pub rows: Vec<Vec<String>>,
  pub truncated: bool,
  pub uncached_formulas: usize,
  pub uncached_cells: std::collections::BTreeSet<(usize, usize)>,
}

pub fn read(
  bytes: Vec<u8>,
  extension: &str,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<Sheet>> {
  check_cancelled(cancelled)?;
  if bytes.len() as u64 > MAX_FILE_BYTES {
    return Err(limits::error("Spreadsheet exceeds the 16 MiB import limit"));
  }
  match extension {
    "xlsx" | "xlsm" => workbook::read(Cursor::new(bytes), cancelled),
    "csv" | "tsv" => delimited(bytes, extension == "tsv", cancelled).map(|sheet| vec![sheet]),
    _ => Err(limits::invalid(
      "Supported spreadsheet imports are XLSX, XLSM, CSV and TSV",
    )),
  }
}

fn delimited(bytes: Vec<u8>, tsv: bool, cancelled: &CancellationToken) -> BackendResult<Sheet> {
  let delimiter = if tsv { b'\t' } else { b',' };
  // UTF-8, including a UTF-8 BOM, is supported. Other encodings fail explicitly.
  let bytes = bytes.strip_prefix(b"\xef\xbb\xbf").unwrap_or(&bytes);
  let guarded = csv_guard::CsvGuard::new(bytes, delimiter);
  let mut reader = csv::ReaderBuilder::new()
    .has_headers(false)
    .flexible(true)
    .delimiter(delimiter)
    .from_reader(guarded);
  let mut record = csv::StringRecord::new();
  let mut sheet = Sheet {
    name: "Sheet1".into(),
    rows: Vec::new(),
    truncated: false,
    uncached_formulas: 0,
    uncached_cells: Default::default(),
  };
  let mut output_bytes = 0;
  let mut rows = 0;
  while reader.read_record(&mut record).map_err(|_| {
    if reader.get_ref().limited {
      limits::error("CSV or TSV record exceeds 4 MiB or 4096 fields")
    } else {
      limits::invalid("CSV and TSV imports require valid UTF-8 data")
    }
  })? {
    check_cancelled(cancelled)?;
    rows += 1;
    if rows > 1_048_576 {
      return Err(limits::error("Spreadsheet exceeds the supported row limit"));
    }
    sheet.truncated |= rows > limits::MAX_ROWS || record.len() > limits::MAX_COLUMNS;
    if rows <= limits::MAX_ROWS {
      sheet.rows.push(
        record
          .iter()
          .take(limits::MAX_COLUMNS)
          .map(|value| limits::append(value, &mut output_bytes, &mut sheet.truncated))
          .collect(),
      );
    }
  }
  Ok(sheet)
}
