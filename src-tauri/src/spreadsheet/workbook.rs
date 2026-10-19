use super::{ReadPageRequest, SpreadsheetPage, input::Prepared, limits, zip_preflight};
use crate::error::BackendResult;
use calamine::{DataRef, Reader, Xlsx};
use std::io::{Seek, SeekFrom};

pub fn read(prepared: Prepared, request: &ReadPageRequest) -> BackendResult<SpreadsheetPage> {
  if request.recalculate {
    return super::calculate::read(prepared, request);
  }
  let mut prepared = prepared.snapshot()?;
  zip_preflight::check(&mut prepared.reader)?;
  prepared.reader.seek(SeekFrom::Start(0))?;
  let mut workbook = Xlsx::new(&mut prepared.reader)
    .map_err(|_| limits::invalid("Cannot read this Excel workbook"))?;
  let sheets = workbook.sheet_names();
  if sheets.len() > 128 || sheets.iter().any(|sheet| sheet.len() > 1024) {
    return Err(limits::error(
      "Workbook has too many or excessively long worksheet names",
    ));
  }
  let sheet = request
    .sheet
    .clone()
    .or_else(|| sheets.first().cloned())
    .ok_or_else(|| limits::invalid("Workbook has no worksheets"))?;
  if !sheets.contains(&sheet) {
    return Err(limits::invalid("Worksheet does not exist"));
  }
  let offset = request.offset.unwrap_or(0);
  let limit = request.limit.unwrap_or(limits::DEFAULT_ROWS);
  let mut page = SpreadsheetPage {
    sheets,
    sheet: sheet.clone(),
    columns: 0,
    total_rows: 0,
    offset,
    rows: vec![Vec::new(); limit],
    truncated: false,
    cells: vec![Vec::new(); limit],
    calculation: Default::default(),
  };
  let mut reader = workbook
    .worksheet_cells_reader(&sheet)
    .map_err(|_| limits::invalid("Cannot read this worksheet"))?;
  let mut cells = 0;
  let mut bytes = 0;
  // Stream native cells directly. worksheet_range would allocate a dense
  // rectangle based on untrusted sparse cell coordinates before we can cap it.
  while let Some(cell) = reader
    .next_cell_with_formula()
    .map_err(|_| limits::invalid("Invalid worksheet cell data"))?
  {
    cells += 1;
    if cells > limits::MAX_WORKBOOK_CELLS {
      return Err(limits::error(
        "Worksheet exceeds the 500,000 cell preview limit",
      ));
    }
    let (row, column) = cell.pos;
    let (row, column) = (row as usize, column as usize);
    if row >= limits::MAX_LOGICAL_ROWS || column >= 16384 {
      return Err(limits::invalid("Worksheet cell has an invalid position"));
    }
    page.total_rows = page.total_rows.max(row + 1);
    page.columns = page.columns.max((column + 1).min(limits::MAX_COLUMNS));
    if column >= limits::MAX_COLUMNS {
      page.truncated = true;
      continue;
    }
    if row < offset || row >= offset + limit {
      continue;
    }
    let output = &mut page.rows[row - offset];
    if output.len() <= column {
      output.resize(column + 1, String::new());
      page.cells[row - offset].resize(column + 1, Default::default());
    }
    page.cells[row - offset][column] = super::cells::from_data(
      &cell.value,
      cell.formula.as_deref(),
      &mut bytes,
      &mut page.truncated,
    );
    let value = match &cell.value {
      DataRef::String(value) => value.as_str(),
      DataRef::SharedString(value) => value,
      other => {
        let value = display(other);
        output[column] = limits::append_cell(&value, &mut bytes, &mut page.truncated);
        continue;
      }
    };
    output[column] = limits::append_cell(value, &mut bytes, &mut page.truncated);
  }
  page
    .rows
    .truncate(page.total_rows.saturating_sub(offset).min(limit));
  page.cells.truncate(page.rows.len());
  page
    .calculation
    .warnings
    .push(super::calculate::FORMAT_WARNING.into());
  drop(reader);
  drop(workbook);
  prepared.reader.verify()?;
  limits::check_offset(&page)?;
  Ok(page)
}

pub(super) fn display(value: &DataRef<'_>) -> String {
  match value {
    DataRef::Empty => String::new(),
    DataRef::Int(value) => value.to_string(),
    DataRef::Float(value) => value.to_string(),
    DataRef::Bool(value) => if *value { "TRUE" } else { "FALSE" }.into(),
    DataRef::Error(value) => value.to_string(),
    DataRef::DateTime(value) if value.is_datetime() => {
      let (year, month, day, hour, minute, second, millisecond) = value.to_ymd_hms_milli();
      if (hour, minute, second, millisecond) == (0, 0, 0, 0) {
        format!("{year:04}-{month:02}-{day:02}")
      } else {
        format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{millisecond:03}")
      }
    }
    DataRef::DateTime(value) => value.to_string(),
    DataRef::DateTimeIso(value) | DataRef::DurationIso(value) | DataRef::String(value) => {
      value.clone()
    }
    DataRef::SharedString(value) => (*value).to_owned(),
  }
}
