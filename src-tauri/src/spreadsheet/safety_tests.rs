use super::{Fixture, request};
use crate::spreadsheet::{fixtures, limits};
use std::io::{Cursor, Write};

#[test]
fn lfs_pointers_report_missing_content_for_files_snapshots_and_calculation() {
  let fixture = Fixture::new();
  let pointer = format!(
    "version https://git-lfs.github.com/spec/v1\noid sha256:{}\nsize 28801\n",
    "a".repeat(64)
  );
  let name = "研发工程师评分规则.xlsx";
  std::fs::write(fixture.root.path().join(name), &pointer).unwrap();
  let capability = fixture
    .assets
    .issue_bytes(
      "main",
      pointer.as_bytes(),
      name,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    .unwrap();
  for recalculate in [false, true] {
    for snapshot in [false, true] {
      let mut input = request(name);
      input.recalculate = recalculate;
      if snapshot {
        input.asset_url = Some(capability.url.clone());
      }
      assert_eq!(
        fixture.read(input).unwrap_err().code,
        "GIT_LFS_CONTENT_MISSING"
      );
    }
  }
  std::fs::write(
    fixture.root.path().join(name),
    b"version https://git-lfs.github.com/spec/v1\nnot a valid pointer\n",
  )
  .unwrap();
  assert_eq!(
    fixture.read(request(name)).unwrap_err().code,
    "INVALID_SPREADSHEET"
  );
}

#[test]
fn zip_expansion_and_entry_counts_are_bounded_before_workbook_parsing() {
  let fixture = Fixture::new();
  for (name, entries, entry_bytes) in [
    ("expanded.xlsx", 1, limits::MAX_XML_BYTES as usize + 1),
    ("entries.xlsx", 513, 0),
  ] {
    let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let bytes = vec![b' '; entry_bytes];
    for index in 0..entries {
      archive
        .start_file(
          format!("entry-{index}.xml"),
          zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated),
        )
        .unwrap();
      archive.write_all(&bytes).unwrap();
    }
    let bytes = archive.finish().unwrap().into_inner();
    assert!(bytes.len() < 100_000);
    std::fs::write(fixture.root.path().join(name), bytes).unwrap();
    assert_eq!(
      fixture.read(request(name)).unwrap_err().code,
      "SPREADSHEET_LIMIT"
    );
  }
}

#[test]
fn distant_sparse_cells_preserve_coordinates_without_allocating_a_dense_rectangle() {
  let fixture = Fixture::new();
  let source = fixtures::worksheet(
    r#"<row r="1"><c r="A1"><v>1</v></c></row><row r="1048576"><c r="XFD1048576"><v>2</v></c></row>"#,
  );
  std::fs::write(
    fixture.root.path().join("sparse.xlsx"),
    fixtures::xlsx(&source, None),
  )
  .unwrap();
  let mut input = request("sparse.xlsx");
  input.limit = Some(1);
  let page = fixture.read(input).unwrap();
  assert_eq!((page.columns, page.total_rows), (256, 1_048_576));
  assert_eq!(page.rows, [vec!["1"]]);
  assert!(page.truncated);
}

#[test]
fn csv_record_guards_prevent_field_index_and_record_buffer_amplification() {
  let fixture = Fixture::new();
  for source in [",".repeat(4096), "x".repeat(4 * 1024 * 1024 + 1)] {
    let mut input = request("limited.csv");
    input.source = Some(source);
    assert_eq!(fixture.read(input).unwrap_err().code, "SPREADSHEET_LIMIT");
  }
}

#[test]
fn huge_shared_formula_indices_and_non_xml_sheet_targets_cannot_bypass_preflight() {
  let fixture = Fixture::new();
  let source = fixtures::worksheet(
    r#"<row r="1"><c r="A1"><f t="shared" si="1000000000" ref="A1:A2">1+1</f><v>2</v></c></row>"#,
  );
  let package = fixtures::xlsx(&source, None);
  std::fs::write(fixture.root.path().join("index.xlsx"), &package).unwrap();
  assert_eq!(
    fixture.read(request("index.xlsx")).unwrap_err().code,
    "SPREADSHEET_LIMIT"
  );
  std::fs::write(
    fixture.root.path().join("alias.xlsx"),
    fixtures::rename_first_sheet(&package),
  )
  .unwrap();
  assert_eq!(
    fixture.read(request("alias.xlsx")).unwrap_err().code,
    "INVALID_SPREADSHEET"
  );
}

#[test]
fn validated_workbook_snapshot_is_immutable_when_the_source_is_replaced() {
  let fixture = Fixture::new();
  let source = fixtures::worksheet(r#"<row r="1"><c r="A1"><v>7</v></c></row>"#);
  let path = fixture.root.path().join("snapshot.xlsx");
  std::fs::write(&path, fixtures::xlsx(&source, None)).unwrap();
  let input = request("snapshot.xlsx");
  let prepared =
    crate::spreadsheet::input::prepare("main", &fixture.workspace, &fixture.assets, &input)
      .unwrap()
      .snapshot()
      .unwrap();
  std::fs::write(path, "source replaced after snapshot").unwrap();
  let page = crate::spreadsheet::workbook::read(prepared, &input).unwrap();
  assert_eq!(page.rows, [vec!["7"]]);
}

#[test]
fn malformed_later_directory_cannot_hide_an_oversized_fallback_directory() {
  let fixture = Fixture::new();
  let mut archive = zip::ZipWriter::new(Cursor::new(Vec::new()));
  for index in 0..513 {
    archive
      .start_file(
        format!("entry-{index}"),
        zip::write::SimpleFileOptions::default(),
      )
      .unwrap();
  }
  let mut bytes = archive.finish().unwrap().into_inner();
  let mut fake_directory = [0u8; 22];
  fake_directory[..4].copy_from_slice(b"PK\x05\x06");
  fake_directory[8..10].copy_from_slice(&1u16.to_le_bytes());
  fake_directory[10..12].copy_from_slice(&1u16.to_le_bytes());
  fake_directory[12..16].copy_from_slice(&46u32.to_le_bytes());
  fake_directory[16..20].copy_from_slice(&1u32.to_le_bytes());
  bytes.extend_from_slice(&fake_directory);
  std::fs::write(fixture.root.path().join("fallback.xlsx"), bytes).unwrap();
  assert_eq!(
    fixture.read(request("fallback.xlsx")).unwrap_err().code,
    "SPREADSHEET_LIMIT"
  );
}

#[cfg(unix)]
#[test]
fn workspace_symlinks_cannot_grant_spreadsheet_access() {
  let fixture = Fixture::new();
  let outside = tempfile::tempdir().unwrap();
  let source = outside.path().join("outside.csv");
  std::fs::write(&source, "outside").unwrap();
  std::os::unix::fs::symlink(source, fixture.root.path().join("linked.csv")).unwrap();
  assert_eq!(
    fixture.read(request("linked.csv")).unwrap_err().code,
    "INVALID_PATH"
  );
}
