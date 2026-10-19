use super::{
  ReadPageRequest, SpreadsheetPage,
  input::{Format, Prepared},
  limits,
};
use crate::error::BackendResult;

pub fn read(mut prepared: Prepared, request: &ReadPageRequest) -> BackendResult<SpreadsheetPage> {
  if request.recalculate {
    return Err(super::calculation_safety::unsupported(
      "Recalculation is available for XLSX and XLSM workbooks",
    ));
  }
  let sheet = "Sheet1".to_owned();
  if request
    .sheet
    .as_ref()
    .is_some_and(|selected| selected != &sheet)
  {
    return Err(limits::invalid("Worksheet does not exist"));
  }
  let offset = request.offset.unwrap_or(0);
  let limit = request.limit.unwrap_or(limits::DEFAULT_ROWS);
  let mut page = SpreadsheetPage {
    sheets: vec![sheet.clone()],
    sheet,
    columns: 0,
    total_rows: 0,
    offset,
    rows: Vec::new(),
    truncated: false,
    cells: Vec::new(),
    calculation: Default::default(),
  };
  let delimiter = if matches!(prepared.format, Format::Tsv) {
    b'\t'
  } else {
    b','
  };
  let guarded = super::csv_guard::CsvGuard::new(&mut prepared.reader, delimiter);
  let mut reader = ::csv::ReaderBuilder::new()
    .has_headers(false)
    .flexible(true)
    .delimiter(delimiter)
    .from_reader(guarded);
  let mut record = ::csv::StringRecord::new();
  let mut bytes = 0;
  while reader.read_record(&mut record).map_err(|_| {
    if reader.get_ref().limited {
      limits::error("CSV or TSV record exceeds 4 MiB or 4096 fields")
    } else {
      limits::invalid("Invalid UTF-8 CSV or TSV data")
    }
  })? {
    if page.total_rows >= limits::MAX_LOGICAL_ROWS {
      return Err(limits::error("Spreadsheet exceeds the supported row limit"));
    }
    page.columns = page.columns.max(record.len().min(limits::MAX_COLUMNS));
    page.truncated |= record.len() > limits::MAX_COLUMNS;
    if page.total_rows >= offset && page.rows.len() < limit {
      let row = record
        .iter()
        .take(limits::MAX_COLUMNS)
        .map(|value| limits::append_cell(value, &mut bytes, &mut page.truncated))
        .collect();
      page.rows.push(row);
    }
    page.total_rows += 1;
  }
  drop(reader);
  prepared.reader.verify()?;
  page.cells = page
    .rows
    .iter()
    .map(|row| {
      row
        .iter()
        .map(|value| super::cells::SpreadsheetCell {
          value: super::cells::CellValue::Text(value.clone()),
          formula: None,
          format: Some("General".into()),
        })
        .collect()
    })
    .collect();
  limits::check_offset(&page)?;
  Ok(page)
}
