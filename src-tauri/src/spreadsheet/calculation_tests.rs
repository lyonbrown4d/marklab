use super::{Fixture, request};
use crate::spreadsheet::{
  cells::{CalculationStatus, CellValue},
  fixtures,
};

fn write(fixture: &Fixture, source: &str) {
  std::fs::write(
    fixture.root.path().join("formula.xlsx"),
    fixtures::xlsx(&fixtures::worksheet(source), None),
  )
  .unwrap();
}

#[test]
fn cached_formula_metadata_and_explicit_recalculation_preserve_scalar_types() {
  let fixture = Fixture::new();
  write(
    &fixture,
    r#"<row r="1"><c r="A1"><v>10</v></c></row><row r="2"><c r="A2"><v>20</v></c></row><row r="3"><c r="A3"><f>SUM(A1:A2)</f><v>99</v></c></row><row r="4"><c r="A4"><f>AVERAGE(A1:A2)</f><v>99</v></c></row><row r="5"><c r="A5" t="str"><f>IF(A3&gt;20,"yes","no")</f><v>old</v></c></row><row r="6"><c r="A6"><f>Other!A1+A3</f><v>99</v></c></row><row r="7"><c r="A7" t="inlineStr"><is><t>=1+1</t></is></c></row>"#,
  );
  let cached = fixture.read(request("formula.xlsx")).unwrap();
  assert_eq!(cached.rows[2][0], "99");
  assert_eq!(cached.cells[2][0].formula.as_deref(), Some("=SUM(A1:A2)"));
  assert!(matches!(
    cached.calculation.status,
    CalculationStatus::Cached
  ));
  let mut input = request("formula.xlsx");
  input.recalculate = true;
  let calculated = fixture.read(input).unwrap();
  assert!(matches!(
    calculated.calculation.status,
    CalculationStatus::Recalculated
  ));
  assert_eq!(
    calculated.rows[2..],
    [
      vec!["30"],
      vec!["15"],
      vec!["yes"],
      vec!["72"],
      vec!["=1+1"]
    ]
  );
  assert!(matches!(
    calculated.cells[2][0].value,
    CellValue::Number(30.0)
  ));
  assert_eq!(calculated.cells[6][0].formula, None);
  assert!(matches!(&calculated.cells[6][0].value, CellValue::Text(value) if value == "=1+1"));
  assert_eq!(
    fixture.read(request("formula.xlsx")).unwrap().rows[2][0],
    "99"
  );
}

#[test]
fn formula_errors_are_recalculated_and_iferror_uses_the_new_error() {
  let fixture = Fixture::new();
  write(
    &fixture,
    r#"<row r="1"><c r="A1" t="e"><f>1/0</f><v>#VALUE!</v></c><c r="B1"><f>IFERROR(A1,0)</f><v>99</v></c></row>"#,
  );
  let mut input = request("formula.xlsx");
  input.recalculate = true;
  let page = fixture.read(input).unwrap();
  assert_eq!(page.rows, [vec!["#DIV/0!", "0"]]);
  assert_eq!(page.calculation.error_count, 1);
}

#[test]
fn unsafe_and_unsupported_formulas_keep_cached_preview_but_fail_recalculation() {
  let fixture = Fixture::new();
  for formula in [
    "REPT(&quot;x&quot;,1000000000)",
    "SUM(A:A)",
    "A1&amp;A1",
    "[Other.xlsx]Data!A1",
  ] {
    write(
      &fixture,
      &format!(r#"<row r="1"><c r="A1"><f>{formula}</f><v>99</v></c></row>"#),
    );
    assert_eq!(
      fixture.read(request("formula.xlsx")).unwrap().rows,
      [vec!["99"]]
    );
    let mut input = request("formula.xlsx");
    input.recalculate = true;
    let error = fixture.read(input).unwrap_err();
    assert!(
      error.code.starts_with("SPREADSHEET_CALCULATION_"),
      "{}",
      error.code
    );
  }
}

#[test]
fn valid_shared_formulas_expand_and_missing_shared_anchors_fail_explicitly() {
  let fixture = Fixture::new();
  write(
    &fixture,
    r#"<row r="1"><c r="A1"><f t="shared" si="0" ref="A1:A2">B1*2</f><v>99</v></c><c r="B1"><v>3</v></c></row><row r="2"><c r="A2"><f t="shared" si="0"/><v>88</v></c><c r="B2"><v>4</v></c></row>"#,
  );
  let mut input = request("formula.xlsx");
  input.recalculate = true;
  let page = fixture.read(input.clone()).unwrap();
  assert_eq!(page.rows, [vec!["6", "3"], vec!["8", "4"]]);
  assert_eq!(page.cells[1][0].formula.as_deref(), Some("=B2*2"));
  write(
    &fixture,
    r#"<row r="1"><c r="A1"><f t="shared" si="0"/><v>99</v></c></row>"#,
  );
  assert_eq!(
    fixture.read(input).unwrap_err().code,
    "SPREADSHEET_CALCULATION_UNSUPPORTED"
  );
}

#[test]
fn date_serial_metadata_normalizes_both_excel_epochs() {
  use calamine::{ExcelDateTime, ExcelDateTimeType};
  let old = ExcelDateTime::new(45943.5, ExcelDateTimeType::DateTime, false);
  let new = ExcelDateTime::new(45943.5 - 1462.0, ExcelDateTimeType::DateTime, true);
  assert_eq!(crate::spreadsheet::cells::date_serial(&old), 45943.5);
  assert_eq!(crate::spreadsheet::cells::date_serial(&new), 45943.5);
}

#[test]
fn bounded_scalar_helpers_are_evaluated_by_the_native_engine() {
  let fixture = Fixture::new();
  write(
    &fixture,
    r#"<row r="1"><c r="A1"><f>ROUND(MAX(1,2)+MIN(2,3)+COUNT(1,2,3),0)</f><v>99</v></c></row>"#,
  );
  let mut input = request("formula.xlsx");
  input.recalculate = true;
  assert_eq!(fixture.read(input).unwrap().rows, [vec!["7"]]);
}

#[test]
fn scattered_native_storage_regions_are_bounded_before_model_allocation() {
  let fixture = Fixture::new();
  let source: String = (0..129)
    .map(|index| {
      let row = index * 1024 + 1;
      format!(r#"<row r="{row}"><c r="A{row}"><v>1</v></c></row>"#)
    })
    .collect();
  write(&fixture, &source);
  let mut input = request("formula.xlsx");
  input.recalculate = true;
  assert_eq!(
    fixture.read(input).unwrap_err().code,
    "SPREADSHEET_CALCULATION_LIMIT"
  );
}

#[test]
fn formula_token_and_formula_count_limits_fail_before_evaluation() {
  let fixture = Fixture::new();
  for source in [
    format!(
      r#"<row r="1"><c r="A1"><f>{}1</f><v>99</v></c></row>"#,
      "+".repeat(600)
    ),
    (1..=129)
      .map(|row| format!(r#"<row r="{row}"><c r="A{row}"><f>1+1</f><v>99</v></c></row>"#))
      .collect(),
  ] {
    write(&fixture, &source);
    let mut input = request("formula.xlsx");
    input.recalculate = true;
    assert_eq!(
      fixture.read(input).unwrap_err().code,
      "SPREADSHEET_CALCULATION_LIMIT"
    );
  }
}
