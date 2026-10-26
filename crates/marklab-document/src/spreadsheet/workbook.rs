use super::{Sheet, limits, zip_preflight};
use crate::{check_cancelled, error::BackendResult};
use calamine::{DataRef, Reader, Xlsx};
use std::io::{Cursor, Seek, SeekFrom};
use tokio_util::sync::CancellationToken;

pub fn read(
  mut input: Cursor<Vec<u8>>,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<Sheet>> {
  zip_preflight::check(&mut input)?;
  input.seek(SeekFrom::Start(0))?;
  let mut workbook =
    Xlsx::new(input).map_err(|_| limits::invalid("Cannot read this Excel workbook"))?;
  let names = workbook.sheet_names();
  if names.is_empty() || names.len() > 128 || names.iter().any(|name| name.len() > 1024) {
    return Err(limits::invalid("Invalid workbook worksheet names"));
  }
  let mut sheets = Vec::new();
  let mut bytes = 0;
  let mut cells = 0;
  let mut allocated = 0usize;
  let mut rendered = 0usize;
  for name in names {
    check_cancelled(cancelled)?;
    let mut sheet = Sheet {
      name: name.clone(),
      rows: Vec::new(),
      truncated: false,
      uncached_formulas: 0,
      uncached_cells: Default::default(),
    };
    let mut reader = workbook
      .worksheet_cells_reader(&name)
      .map_err(|_| limits::invalid("Cannot read this worksheet"))?;
    while let Some(cell) = reader
      .next_cell_with_formula()
      .map_err(|_| limits::invalid("Invalid worksheet cell data"))?
    {
      cells += 1;
      if cells > 500_000 {
        return Err(limits::error(
          "Workbook exceeds the 500,000 cell import limit",
        ));
      }
      if cells % 1024 == 0 {
        check_cancelled(cancelled)?;
      }
      let (row, column) = (cell.pos.0 as usize, cell.pos.1 as usize);
      if row >= 1_048_576 || column >= 16384 {
        return Err(limits::invalid("Invalid worksheet cell position"));
      }
      if row >= limits::MAX_ROWS || column >= limits::MAX_COLUMNS {
        sheet.truncated = true;
        continue;
      }
      if sheet.rows.len() <= row {
        sheet.rows.resize_with(row + 1, Vec::new);
      }
      let output = &mut sheet.rows[row];
      if output.len() <= column {
        allocated += column + 1 - output.len();
        if allocated > 500_000 {
          return Err(limits::error(
            "Workbook exceeds the 500,000 exported cell allocation limit",
          ));
        }
        output.resize(column + 1, String::new());
      }
      let value = if matches!(cell.value, DataRef::Empty) && cell.formula.is_some() {
        sheet.uncached_formulas += 1;
        sheet.uncached_cells.insert((row, column));
        "[formula has no cached value]".into()
      } else {
        display(&cell.value)
      };
      output[column] = limits::append(&value, &mut bytes, &mut sheet.truncated);
    }
    rendered += sheet.rows.len() * sheet.rows.iter().map(Vec::len).max().unwrap_or(0);
    if rendered > 500_000 {
      return Err(limits::error(
        "Workbook exceeds the 500,000 exported table cell limit",
      ));
    }
    sheets.push(sheet);
  }
  Ok(sheets)
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
