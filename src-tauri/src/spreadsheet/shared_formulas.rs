use super::calculation_safety as safety;
use crate::error::BackendResult;
use calamine::{Dimensions, Xlsx, XlsxFormulaMetadata};
use std::{
  collections::HashMap,
  io::{Read, Seek},
};

pub fn validate<R: Read + Seek>(workbook: &mut Xlsx<R>, sheets: &[String]) -> BackendResult<()> {
  let mut cells = 0;
  let mut formulas = 0;
  for sheet in sheets {
    let mut anchors = HashMap::<usize, Dimensions>::new();
    let mut reader = workbook
      .worksheet_cells_reader(sheet)
      .map_err(|_| safety::unsupported("Cannot read formula metadata"))?;
    while let Some(record) = reader
      .next_cell_with_formula_metadata()
      .map_err(|_| safety::unsupported("Invalid formula metadata"))?
    {
      cells += 1;
      if cells > safety::MAX_CELLS {
        return Err(safety::limit(
          "Calculation is limited to 20,000 workbook cells",
        ));
      }
      let Some(formula) = record.formula else {
        continue;
      };
      formulas += 1;
      if formulas > safety::MAX_FORMULAS {
        return Err(safety::limit("Calculation is limited to 128 formula cells"));
      }
      match formula {
        XlsxFormulaMetadata::Normal { formula } => safety::formula_text(&formula)?,
        XlsxFormulaMetadata::Shared {
          shared_index,
          range: Some(range),
          formula,
        } => {
          safety::formula_text(&formula)?;
          if formula.is_empty()
            || range.start != record.pos
            || range.end.0 < range.start.0
            || range.end.1 < range.start.1
            || range.end.0 >= 1_048_576
            || range.end.1 >= 16384
            || range.len() > safety::MAX_CELLS as u64
          {
            return Err(safety::unsupported(
              "Shared formula has an invalid or oversized anchor range",
            ));
          }
          anchors.insert(shared_index, range);
        }
        XlsxFormulaMetadata::SharedDerived { shared_index } => {
          let valid = anchors.get(&shared_index).is_some_and(|range| {
            record.pos.0 >= range.start.0
              && record.pos.0 <= range.end.0
              && record.pos.1 >= range.start.1
              && record.pos.1 <= range.end.1
          });
          if !valid {
            return Err(safety::unsupported(
              "Shared formula anchor is missing or appears after its derived cells",
            ));
          }
        }
        _ => return Err(safety::unsupported("Unsupported shared formula metadata")),
      }
    }
  }
  Ok(())
}
