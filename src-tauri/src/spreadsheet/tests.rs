use super::*;
use crate::{
  assets::AssetService,
  workspace::{Workspace, WorkspaceRegistry},
};

struct Fixture {
  root: tempfile::TempDir,
  data: tempfile::TempDir,
  service: SpreadsheetService,
  assets: AssetService,
  workspace: Arc<Workspace>,
}

impl Fixture {
  fn new() -> Self {
    let root = tempfile::tempdir().unwrap();
    let data = tempfile::tempdir().unwrap();
    let assets = AssetService::new(data.path()).unwrap();
    let registry = WorkspaceRegistry::new(data.path()).unwrap();
    let workspace = registry.open("main", root.path().to_str(), false).unwrap();
    Self {
      root,
      data,
      service: SpreadsheetService::default(),
      assets,
      workspace,
    }
  }

  fn read(&self, request: ReadPageRequest) -> BackendResult<SpreadsheetPage> {
    self
      .service
      .read("main", &self.workspace, &self.assets, request)
  }
}

fn request(path: &str) -> ReadPageRequest {
  ReadPageRequest {
    path: path.into(),
    source: None,
    asset_url: None,
    sheet: None,
    offset: None,
    limit: None,
    recalculate: false,
  }
}

#[test]
fn csv_pages_preserve_first_record_quotes_multiline_and_uneven_columns() {
  let fixture = Fixture::new();
  std::fs::write(
    fixture.root.path().join("data.csv"),
    "name,note\nAlice,\"hello, world\"\nBob,\"line1\nline2\",extra\n",
  )
  .unwrap();
  let mut input = request("data.csv");
  input.offset = Some(1);
  input.limit = Some(2);
  let page = fixture.read(input).unwrap();
  assert_eq!(page.sheets, ["Sheet1"]);
  assert_eq!((page.columns, page.total_rows, page.offset), (3, 3, 1));
  assert_eq!(
    page.rows,
    [
      vec!["Alice", "hello, world"],
      vec!["Bob", "line1\nline2", "extra"]
    ]
  );
  assert!(!page.truncated);
  assert_eq!(
    fixture.read(request("data.csv")).unwrap().rows[0],
    ["name", "note"]
  );
}

#[test]
fn live_tsv_uses_unsaved_source_and_does_not_treat_formulas_as_code() {
  let fixture = Fixture::new();
  std::fs::write(fixture.root.path().join("data.tsv"), "disk\tvalue").unwrap();
  let mut input = request("data.tsv");
  input.source = Some("名称\t金额\n=1+1\t\"two\tparts\"".into());
  let page = fixture.read(input).unwrap();
  assert_eq!(
    page.rows,
    [vec!["名称", "金额"], vec!["=1+1", "two\tparts"]]
  );
  assert_eq!(page.total_rows, 2);
  assert_eq!(
    std::fs::read_to_string(fixture.root.path().join("data.tsv")).unwrap(),
    "disk\tvalue"
  );
}

#[test]
fn excel_stream_preserves_leading_blank_rows_columns_and_sheet_selection() {
  let fixture = Fixture::new();
  let source = super::fixtures::worksheet(
    r#"<row r="2"><c r="B2" t="inlineStr"><is><t>Heading</t></is></c><c r="C2"><v>7</v></c></row><row r="3"><c r="B3" t="b"><v>1</v></c><c r="C3" s="1"><v>45943</v></c></row>"#,
  );
  std::fs::write(
    fixture.root.path().join("data.xlsx"),
    super::fixtures::xlsx(&source, None),
  )
  .unwrap();
  let page = fixture.read(request("data.xlsx")).unwrap();
  assert_eq!(page.sheets, ["Data", "Other"]);
  assert_eq!(page.sheet, "Data");
  assert_eq!((page.columns, page.total_rows), (3, 3));
  assert_eq!(
    page.rows,
    [
      vec![],
      vec!["", "Heading", "7"],
      vec!["", "TRUE", "2025-10-13"]
    ]
  );
  let mut other = request("data.xlsx");
  other.sheet = Some("Other".into());
  assert_eq!(fixture.read(other).unwrap().rows, [vec!["42"]]);
}

#[test]
fn snapshots_require_owner_and_remain_immutable_after_disk_edits() {
  let fixture = Fixture::new();
  let capability = fixture
    .assets
    .issue_bytes("main", b"saved,version", "data.csv", "text/csv")
    .unwrap();
  let mut input = request("data.csv");
  input.asset_url = Some(capability.url.clone());
  assert_eq!(
    fixture.read(input.clone()).unwrap().rows,
    [vec!["saved", "version"]]
  );
  let error = fixture
    .service
    .read("other", &fixture.workspace, &fixture.assets, input.clone())
    .unwrap_err();
  assert_eq!(error.code, "ASSET_EXPIRED");
  let path = fixture
    .assets
    .resolve_capability_path("main", &capability.url)
    .unwrap();
  std::fs::write(path, "changed").unwrap();
  assert_eq!(fixture.read(input).unwrap_err().code, "ASSET_CHANGED");
}

#[test]
fn unsupported_invalid_malformed_and_denied_inputs_are_errors() {
  let fixture = Fixture::new();
  std::fs::write(fixture.root.path().join("data.csv"), [0xff, 0xfe]).unwrap();
  assert_eq!(
    fixture.read(request("data.csv")).unwrap_err().code,
    "INVALID_SPREADSHEET"
  );
  std::fs::write(fixture.root.path().join("data.xlsx"), "not a workbook").unwrap();
  assert_eq!(
    fixture.read(request("data.xlsx")).unwrap_err().code,
    "INVALID_SPREADSHEET"
  );
  for path in ["data.xls", "data.xlsb", "data.ods"] {
    assert_eq!(
      fixture.read(request(path)).unwrap_err().code,
      "INVALID_SPREADSHEET"
    );
  }
  assert_eq!(
    fixture.read(request("../outside.csv")).unwrap_err().code,
    "INVALID_PATH"
  );
  for limit in [0, limits::MAX_ROWS + 1] {
    let mut input = request("data.csv");
    input.limit = Some(limit);
    assert_eq!(fixture.read(input).unwrap_err().code, "INVALID_SPREADSHEET");
  }
  let mut input = request("data.csv");
  input.source = Some("a,b".into());
  input.offset = Some(2);
  assert_eq!(fixture.read(input).unwrap_err().code, "INVALID_SPREADSHEET");
  let mut input = request("data.csv");
  input.source = Some("a,b".into());
  input.sheet = Some("missing".into());
  assert_eq!(fixture.read(input).unwrap_err().code, "INVALID_SPREADSHEET");
}

#[test]
fn cell_column_and_total_output_limits_are_visible_and_utf8_safe() {
  let fixture = Fixture::new();
  let mut input = request("data.csv");
  let row = vec!["界".repeat(2000); 300].join(",");
  input.source = Some(format!("{row}\n{row}"));
  let page = fixture.read(input).unwrap();
  assert_eq!(page.columns, 256);
  assert_eq!(page.rows[0].len(), 256);
  assert!(page.truncated);
  assert!(
    page.rows[0]
      .iter()
      .all(|cell| cell.len() <= limits::MAX_CELL_BYTES)
  );
  assert!(page.rows.iter().flatten().map(String::len).sum::<usize>() <= limits::MAX_OUTPUT_BYTES);
}

#[path = "calculation_tests.rs"]
mod calculation_tests;
#[path = "safety_tests.rs"]
mod safety_tests;

#[test]
fn sparse_large_files_and_archive_allocation_hints_are_rejected_before_parsing() {
  let fixture = Fixture::new();
  std::fs::File::create(fixture.root.path().join("huge.csv"))
    .unwrap()
    .set_len(limits::MAX_FILE_BYTES + 1)
    .unwrap();
  assert_eq!(
    fixture.read(request("huge.csv")).unwrap_err().code,
    "SPREADSHEET_LIMIT"
  );
  let source = super::fixtures::worksheet(r#"<row r="1"><c r="A1" t="s"><v>0</v></c></row>"#);
  let bytes = super::fixtures::xlsx(
    &source,
    Some(
      r#"<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" uniqueCount="999999999999"><si><t>safe</t></si></sst>"#,
    ),
  );
  std::fs::write(fixture.root.path().join("bad.xlsx"), bytes).unwrap();
  assert_eq!(
    fixture.read(request("bad.xlsx")).unwrap_err().code,
    "SPREADSHEET_LIMIT"
  );
}

#[test]
fn cache_refreshes_disk_changes_and_is_scoped_to_workspace_generation() {
  let fixture = Fixture::new();
  let path = fixture.root.path().join("data.csv");
  std::fs::write(&path, "first").unwrap();
  assert_eq!(
    fixture.read(request("data.csv")).unwrap().rows,
    [vec!["first"]]
  );
  std::fs::write(path, "second content").unwrap();
  assert_eq!(
    fixture.read(request("data.csv")).unwrap().rows,
    [vec!["second content"]]
  );
  let registry = WorkspaceRegistry::new(fixture.data.path()).unwrap();
  let single_path = fixture.root.path().join("single.csv");
  std::fs::write(&single_path, "single").unwrap();
  let single = registry.open("single", single_path.to_str(), true).unwrap();
  assert_eq!(
    fixture
      .service
      .read("single", &single, &fixture.assets, request("data.csv"))
      .unwrap_err()
      .code,
    "INVALID_PATH"
  );
}

#[test]
fn request_contract_rejects_unknown_fields_and_negative_page_values() {
  for input in [
    r#"{"path":"data.csv","extra":true}"#,
    r#"{"path":"data.csv","offset":-1}"#,
  ] {
    assert!(serde_json::from_str::<ReadPageRequest>(input).is_err());
  }
}
