use super::*;
use std::io::{Cursor, Write};

fn archive(name: &str, content: &str) -> Vec<u8> {
  let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
  writer
    .start_file(name, zip::write::SimpleFileOptions::default())
    .expect("entry");
  writer.write_all(content.as_bytes()).expect("content");
  writer.finish().expect("archive").into_inner()
}

#[test]
fn allocation_hints_and_expanded_xml_are_rejected_before_workbook_parsing() {
  for (name, content) in [
    (
      "xl/sharedStrings.xml",
      "<sst uniqueCount=\"999999999\"/>".into(),
    ),
    (
      "xl/worksheets/sheet1.xml",
      "x".repeat(limits::MAX_XML_BYTES as usize + 1),
    ),
  ] {
    let error = read(archive(name, &content), "xlsx", &CancellationToken::new())
      .err()
      .expect("limited");
    assert_eq!(error.code, "SPREADSHEET_LIMIT");
  }
}

#[test]
fn delimited_record_guard_rejects_allocation_bombs_and_cancellation() {
  let error = read(
    vec![b'x'; 4 * 1024 * 1024 + 1],
    "csv",
    &CancellationToken::new(),
  )
  .err()
  .expect("limited");
  assert_eq!(error.code, "SPREADSHEET_LIMIT");
  let token = CancellationToken::new();
  token.cancel();
  assert_eq!(
    read(b"a,b".to_vec(), "csv", &token)
      .err()
      .expect("cancelled")
      .code,
    "EXPORT_CANCELLED"
  );
}
