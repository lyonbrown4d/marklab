use crate::error::{BackendError, BackendResult};
use ironcalc_base::expressions::{
  lexer::{Lexer, LexerMode},
  parser::{Node, new_parser_english},
  token::TokenType,
  types::CellReferenceRC,
};
use std::collections::{HashMap, HashSet};

pub const MAX_CELLS: usize = 20_000;
pub const MAX_FORMULAS: usize = 128;
pub const MAX_SHEETS: usize = 8;

pub fn unsupported(message: &str) -> BackendError {
  BackendError::new("SPREADSHEET_CALCULATION_UNSUPPORTED", message)
}

pub fn limit(message: &str) -> BackendError {
  BackendError::new("SPREADSHEET_CALCULATION_LIMIT", message)
}

pub fn formula_text(formula: &str) -> BackendResult<()> {
  if formula.len() > 1024 {
    return Err(limit("Calculation formulas are limited to 1024 bytes"));
  }
  let mut lexer = Lexer::new(
    formula,
    LexerMode::A1,
    ironcalc_base::locale::get_default_locale(),
    ironcalc_base::language::get_default_language(),
  );
  let mut depth = 0usize;
  for _ in 0..256 {
    match lexer.next_token() {
      TokenType::EOF => return Ok(()),
      TokenType::LeftParenthesis => {
        depth += 1;
        if depth > 32 {
          return Err(limit("Calculation formula nesting exceeds 32 levels"));
        }
      }
      TokenType::RightParenthesis => depth = depth.saturating_sub(1),
      _ => {}
    }
  }
  Err(limit("Calculation formulas are limited to 256 tokens"))
}

pub fn validate(cells: &[super::calculate::NativeCell], sheets: &[String]) -> BackendResult<()> {
  let mut parser = new_parser_english(sheets.to_vec(), Vec::new(), HashMap::new());
  let mut budget = Budget {
    nodes: 0,
    ranges: 0,
  };
  let mut row_regions = HashSet::new();
  for cell in cells {
    // IronCalc 0.9 allocates row metadata in blocks of 1024. Bound occupied
    // blocks as well as cells so widely scattered inputs stay lightweight.
    if cell.cell.formula.is_some() || !matches!(&cell.cell.value, super::cells::CellValue::Empty) {
      row_regions.insert((cell.sheet, (cell.row - 1) / 1024));
      if row_regions.len() > 128 {
        return Err(limit(
          "Calculation is limited to 128 occupied row regions across the workbook",
        ));
      }
    }
    let Some(formula) = &cell.cell.formula else {
      continue;
    };
    formula_text(formula)?;
    let context = CellReferenceRC {
      sheet: sheets[cell.sheet as usize].clone(),
      row: cell.row,
      column: cell.column,
    };
    let node = parser.parse(formula.strip_prefix('=').unwrap_or(formula), &context);
    visit(&node, &context, false, 0, &mut budget)?;
  }
  Ok(())
}

struct Budget {
  nodes: usize,
  ranges: u64,
}

fn visit(
  node: &Node,
  context: &CellReferenceRC,
  range_allowed: bool,
  depth: usize,
  budget: &mut Budget,
) -> BackendResult<()> {
  budget.nodes += 1;
  if depth > 32 || budget.nodes > 4096 {
    return Err(limit("Calculation exceeds the formula complexity budget"));
  }
  match node {
    Node::NumberKind(value) if value.is_finite() => Ok(()),
    Node::BooleanKind(_) | Node::StringKind(_) | Node::EmptyArgKind | Node::ErrorKind(_) => Ok(()),
    Node::ReferenceKind {
      row,
      column,
      absolute_row,
      absolute_column,
      ..
    } => coordinate(*row, *column, *absolute_row, *absolute_column, context).map(|_| ()),
    Node::RangeKind {
      row1,
      column1,
      absolute_row1,
      absolute_column1,
      row2,
      column2,
      absolute_row2,
      absolute_column2,
      ..
    } if range_allowed => {
      let (row1, column1) =
        coordinate(*row1, *column1, *absolute_row1, *absolute_column1, context)?;
      let (row2, column2) =
        coordinate(*row2, *column2, *absolute_row2, *absolute_column2, context)?;
      let area =
        ((row2 - row1).unsigned_abs() as u64 + 1) * ((column2 - column1).unsigned_abs() as u64 + 1);
      budget.ranges += area;
      if area > 10_000 || budget.ranges > 1_000_000 {
        return Err(limit(
          "Calculation ranges are limited to 10,000 cells and 1,000,000 total visits",
        ));
      }
      Ok(())
    }
    Node::FunctionKind { kind, args } => {
      let name = kind.to_xlsx_string();
      let aggregate = matches!(name.as_str(), "SUM" | "AVERAGE" | "MIN" | "MAX" | "COUNT");
      if !aggregate && !matches!(name.as_str(), "IF" | "IFERROR" | "ROUND") {
        return Err(unsupported(&format!(
          "Calculation does not support function {name}; supported functions are SUM, AVERAGE, MIN, MAX, COUNT, IF, IFERROR and ROUND"
        )));
      }
      for argument in args {
        visit(argument, context, aggregate, depth + 1, budget)?;
      }
      Ok(())
    }
    Node::OpSumKind { left, right, .. }
    | Node::OpProductKind { left, right, .. }
    | Node::OpPowerKind { left, right }
    | Node::CompareKind { left, right, .. } => {
      visit(left, context, false, depth + 1, budget)?;
      visit(right, context, false, depth + 1, budget)
    }
    Node::UnaryKind { right, .. } => visit(right, context, false, depth + 1, budget),
    _ => Err(unsupported(
      "Calculation supports scalar formulas and bounded local cell references; arrays, external links, named ranges, concatenation and spill formulas are unsupported",
    )),
  }
}

fn coordinate(
  row: i32,
  column: i32,
  absolute_row: bool,
  absolute_column: bool,
  context: &CellReferenceRC,
) -> BackendResult<(i32, i32)> {
  let row = if absolute_row {
    row
  } else {
    row.saturating_add(context.row)
  };
  let column = if absolute_column {
    column
  } else {
    column.saturating_add(context.column)
  };
  if !(1..=1_048_576).contains(&row) || !(1..=16384).contains(&column) {
    return Err(unsupported(
      "Calculation reference is outside the worksheet",
    ));
  }
  Ok((row, column))
}
