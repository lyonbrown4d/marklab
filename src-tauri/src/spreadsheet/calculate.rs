use super::{
  ReadPageRequest, SpreadsheetPage, calculation_safety as safety,
  cells::{self, CellValue, SpreadsheetCell},
  input::Prepared,
  limits,
};
use crate::error::{BackendError, BackendResult};
use calamine::{DataRef, Reader, Xlsx};
use ironcalc_base::Model;
use std::io::{Cursor, Seek, SeekFrom};

pub const FORMAT_WARNING: &str = "SPREADSHEET_FORMATS_SIMPLIFIED";

pub struct NativeCell {
  pub sheet: u32,
  pub row: i32,
  pub column: i32,
  pub cell: SpreadsheetCell,
}

pub fn read(prepared: Prepared, request: &ReadPageRequest) -> BackendResult<SpreadsheetPage> {
  // Validate and calculate from the same immutable bytes, never by reopening
  // an editable source after preflight.
  let mut input = Cursor::new(prepared.reader.into_bytes()?);
  super::zip_preflight::check_calculation(&mut input)?;
  input.seek(SeekFrom::Start(0))?;
  let mut workbook = Xlsx::new(input).map_err(|_| limits::invalid("Cannot read this workbook"))?;
  let sheets = workbook.sheet_names();
  if sheets.is_empty() || sheets.len() > safety::MAX_SHEETS {
    return Err(safety::limit("Calculation supports at most 8 worksheets"));
  }
  let selected = request.sheet.as_ref().unwrap_or(&sheets[0]);
  let selected_index = sheets
    .iter()
    .position(|sheet| sheet == selected)
    .ok_or_else(|| limits::invalid("Worksheet does not exist"))?;
  super::shared_formulas::validate(&mut workbook, &sheets)?;
  let mut native_cells = Vec::new();
  let mut formulas = 0;
  let mut text_bytes = 0;
  for (sheet, name) in sheets.iter().enumerate() {
    let mut reader = workbook
      .worksheet_cells_reader(name)
      .map_err(|_| limits::invalid("Cannot read this worksheet"))?;
    while let Some(record) = reader
      .next_cell_with_formula()
      .map_err(|_| limits::invalid("Invalid workbook cell"))?
    {
      if native_cells.len() >= safety::MAX_CELLS {
        return Err(safety::limit(
          "Calculation is limited to 20,000 workbook cells",
        ));
      }
      if let Some(formula) = &record.formula {
        formulas += 1;
        if formulas > safety::MAX_FORMULAS {
          return Err(safety::limit("Calculation is limited to 128 formula cells"));
        }
        safety::formula_text(formula)?;
      }
      let text = match &record.value {
        DataRef::String(value) | DataRef::DateTimeIso(value) | DataRef::DurationIso(value) => {
          Some(value.as_str())
        }
        DataRef::SharedString(value) => Some(*value),
        DataRef::Error(_) if record.formula.is_none() => {
          return Err(safety::unsupported(
            "Calculation cannot import existing error cells",
          ));
        }
        DataRef::Float(value) if !value.is_finite() && record.formula.is_none() => {
          return Err(safety::unsupported(
            "Calculation cannot import non-finite numbers",
          ));
        }
        _ => None,
      };
      if let Some(text) = text.filter(|_| record.formula.is_none()) {
        text_bytes += text.len();
        if text.len() > 4096 || text_bytes > 4 * 1024 * 1024 {
          return Err(safety::limit(
            "Calculation text exceeds 4 KiB per cell or 4 MiB per workbook",
          ));
        }
      }
      if record.pos.0 >= limits::MAX_LOGICAL_ROWS as u32 || record.pos.1 >= 16384 {
        return Err(limits::invalid("Invalid workbook cell position"));
      }
      native_cells.push(NativeCell {
        sheet: sheet as u32,
        row: record.pos.0 as i32 + 1,
        column: record.pos.1 as i32 + 1,
        cell: cells::from_data(&record.value, record.formula.as_deref(), &mut 0, &mut false),
      });
    }
  }
  safety::validate(&native_cells, &sheets)?;
  let mut model = Model::new_empty("Preview", "en", "UTC", "en").map_err(engine_error)?;
  model
    .rename_sheet_by_index(0, &sheets[0])
    .map_err(engine_error)?;
  for sheet in sheets.iter().skip(1) {
    model.add_sheet(sheet).map_err(engine_error)?;
  }
  for native in &native_cells {
    insert(&mut model, native)?;
  }
  model.set_max_evaluation_depth(32);
  model.set_max_evaluation_stack(256 * 1024);
  model.evaluate();
  let mut page = page(&model, &native_cells, &sheets, selected_index, request)?;
  let errors = native_cells
    .iter()
    .filter(|cell| cell.cell.formula.is_some())
    .filter(|cell| {
      model
        .get_cell_type(cell.sheet, cell.row, cell.column)
        .is_ok_and(|kind| kind == ironcalc_base::types::CellType::ErrorValue)
    })
    .count();
  page.calculation.error_count = errors;
  Ok(page)
}

fn engine_error(_: String) -> BackendError {
  BackendError::new(
    "SPREADSHEET_CALCULATION_FAILED",
    "Native spreadsheet calculation failed",
  )
}

fn insert(model: &mut Model<'_>, native: &NativeCell) -> BackendResult<()> {
  let (sheet, row, column) = (native.sheet, native.row, native.column);
  if let Some(formula) = &native.cell.formula {
    model
      .update_cell_with_formula(sheet, row, column, formula.clone())
      .map_err(engine_error)?;
  } else {
    match &native.cell.value {
      CellValue::Number(value) => model
        .update_cell_with_number(sheet, row, column, *value)
        .map_err(engine_error)?,
      CellValue::Boolean(value) => model
        .update_cell_with_bool(sheet, row, column, *value)
        .map_err(engine_error)?,
      CellValue::Text(value) => model
        .update_cell_with_text(sheet, row, column, value)
        .map_err(engine_error)?,
      CellValue::Empty => {}
    }
  }
  Ok(())
}

fn page(
  model: &Model<'_>,
  native_cells: &[NativeCell],
  sheets: &[String],
  selected: usize,
  request: &ReadPageRequest,
) -> BackendResult<SpreadsheetPage> {
  let offset = request.offset.unwrap_or(0);
  let limit = request.limit.unwrap_or(limits::DEFAULT_ROWS);
  let mut page = SpreadsheetPage {
    sheets: sheets.to_vec(),
    sheet: sheets[selected].clone(),
    columns: 0,
    total_rows: 0,
    offset,
    rows: vec![Vec::new(); limit],
    cells: vec![Vec::new(); limit],
    truncated: false,
    calculation: cells::Calculation {
      status: cells::CalculationStatus::Recalculated,
      warnings: vec![FORMAT_WARNING.into()],
      error_count: 0,
    },
  };
  let mut bytes = 0;
  for native in native_cells
    .iter()
    .filter(|cell| cell.sheet as usize == selected)
  {
    let (row, column) = (native.row as usize - 1, native.column as usize - 1);
    page.total_rows = page.total_rows.max(row + 1);
    page.columns = page.columns.max((column + 1).min(limits::MAX_COLUMNS));
    if column >= limits::MAX_COLUMNS {
      page.truncated = true;
      continue;
    }
    if row < offset || row >= offset + limit {
      continue;
    }
    let output_row = row - offset;
    if page.rows[output_row].len() <= column {
      page.rows[output_row].resize_with(column + 1, String::new);
      page.cells[output_row].resize_with(column + 1, SpreadsheetCell::default);
    }
    let value = model
      .get_cell_value_by_index(native.sheet, native.row, native.column)
      .map_err(engine_error)?;
    let (value, display) = match value {
      ironcalc_base::cell::CellValue::None => (CellValue::Empty, String::new()),
      ironcalc_base::cell::CellValue::Number(value) => {
        (CellValue::Number(value), value.to_string())
      }
      ironcalc_base::cell::CellValue::Boolean(value) => (
        CellValue::Boolean(value),
        if value { "TRUE" } else { "FALSE" }.into(),
      ),
      ironcalc_base::cell::CellValue::String(value) => {
        let value = limits::append_cell(&value, &mut bytes, &mut page.truncated);
        (CellValue::Text(value.clone()), value)
      }
    };
    page.rows[output_row][column] = display;
    page.cells[output_row][column] = SpreadsheetCell {
      value,
      formula: native.cell.formula.clone(),
      format: native.cell.format.clone(),
    };
  }
  page
    .rows
    .truncate(page.total_rows.saturating_sub(offset).min(limit));
  page.cells.truncate(page.rows.len());
  limits::check_offset(&page)?;
  Ok(page)
}
