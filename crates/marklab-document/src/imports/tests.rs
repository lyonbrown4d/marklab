use super::*;
use crate::{ExportFormat, PublicationOptions, SourceDocument};
use std::{
  collections::BTreeMap,
  io::{Cursor, Read, Write},
  path::PathBuf,
};

struct Fixture(PathBuf);
impl Fixture {
  fn new() -> Self {
    let root = std::env::temp_dir().join(format!("marklab-import-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir(&root).expect("fixture directory");
    Self(root)
  }
  fn write(&self, name: &str, bytes: impl AsRef<[u8]>) {
    std::fs::write(self.0.join(name), bytes).expect("fixture");
  }
  fn prepare(&self, markdown: &str, linked: bool) -> BackendResult<String> {
    prepare(
      &self.0,
      &self.0,
      markdown,
      linked,
      "en-US",
      &CancellationToken::new(),
    )
  }
}
impl Drop for Fixture {
  fn drop(&mut self) {
    let _ = std::fs::remove_dir_all(&self.0);
  }
}

fn workbook() -> Vec<u8> {
  let mut zip = zip::ZipWriter::new(Cursor::new(Vec::new()));
  let entries = [
    (
      "[Content_Types].xml",
      r#"<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>"#,
    ),
    (
      "_rels/.rels",
      r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#,
    ),
    (
      "xl/styles.xml",
      r#"<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="1"><xf numFmtId="0"/></cellXfs></styleSheet>"#,
    ),
    (
      "xl/workbook.xml",
      r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>"#,
    ),
    (
      "xl/_rels/workbook.xml.rels",
      r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>"#,
    ),
    (
      "xl/worksheets/sheet1.xml",
      r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Alpha</t></is></c><c r="B1"><f>1+2</f><v>3</v></c></row></sheetData></worksheet>"#,
    ),
    (
      "xl/worksheets/sheet2.xml",
      r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Beta</t></is></c><c r="B1"><f>SUM(A1)</f></c></row></sheetData></worksheet>"#,
    ),
  ];
  for (name, xml) in entries {
    zip
      .start_file(name, zip::write::SimpleFileOptions::default())
      .expect("entry");
    zip.write_all(xml.as_bytes()).expect("xml");
  }
  zip.finish().expect("zip").into_inner()
}

#[test]
fn imports_all_worksheets_cached_formulas_and_warns_for_missing_cache() {
  let f = Fixture::new();
  f.write("book.xlsx", workbook());
  let expanded = f
    .prepare("Before ![Workbook](book.xlsx \"Scorecard\") after.", false)
    .expect("expand");
  assert!(expanded.starts_with("Before \n\n## Scorecard"));
  for text in [
    "### First",
    "### Second",
    "Alpha",
    "Beta",
    "| Alpha | 3 |",
    "no cached value",
    "after.",
  ] {
    assert!(expanded.contains(text), "missing {text}: {expanded}");
  }
  assert!(!expanded.contains("SUM(A1)"));
}

#[test]
fn csv_escapes_cell_markup_and_preserves_newlines_and_images() {
  let f = Fixture::new();
  f.write(
    "data.csv",
    "\u{feff}Name,Value\n\"a|b\",\"<script>\n*bold*\"\n",
  );
  let expanded = f
    .prepare("![chart](chart.png)\n\n![[data.csv|Details]]", false)
    .expect("expand");
  assert!(expanded.contains("![chart](chart.png)"));
  assert!(expanded.contains("## Details"));
  assert!(expanded.contains("a\\|b"));
  assert!(expanded.contains("&lt;script&gt;<br>\\*bold\\*"));
  let parsed = crate::markdown::parse(&expanded).expect("parse");
  assert!(parsed.iter().any(|node| matches!(
    node,
    crate::markdown::Node::Element(crate::markdown::Kind::Table(2), _)
  )));
}

#[test]
fn ordinary_links_expand_only_when_requested_and_remain_valid_inside_tables() {
  let f = Fixture::new();
  f.write("data.tsv", "one\ttwo\n");
  let markdown =
    "| Link |\n| --- |\n| [values](data.tsv) |\n\n[remote](https://example.test/data.xlsx)";
  assert_eq!(f.prepare(markdown, false).expect("unchanged"), markdown);
  let expanded = f.prepare(markdown, true).expect("expand");
  assert!(expanded.starts_with(markdown));
  assert!(expanded.contains("| one | two |"));
  assert_eq!(expanded.matches("## data.tsv").count(), 1);
  let nested = f
    .prepare("[![](data.tsv)](data.tsv)", true)
    .expect("nested embed");
  assert_eq!(nested.matches("## data.tsv").count(), 1);
  assert!(nested.starts_with("[Spreadsheet attachment](data.tsv)\n\n"));
  let nested_wiki = f
    .prepare("[![[data.tsv]]](doc.md)", false)
    .expect("wiki link label");
  assert!(nested_wiki.starts_with("[Spreadsheet attachment](doc.md)\n\n"));

  assert_eq!(
    f.prepare("`![[data.tsv]]`\n\n```md\n![](data.tsv)\n```", false)
      .expect("code"),
    "`![[data.tsv]]`\n\n```md\n![](data.tsv)\n```"
  );
}

#[test]
fn missing_remote_unsupported_encoding_and_oversized_files_fail_explicitly() {
  let f = Fixture::new();
  assert_eq!(
    f.prepare("![](missing.xlsx)", false)
      .expect_err("missing")
      .code,
    "SPREADSHEET_IMPORT_FAILED"
  );
  assert_eq!(
    f.prepare("![](https://example.test/data.xlsx)", false)
      .expect_err("remote")
      .code,
    "INVALID_PATH"
  );
  f.write("old.xls", b"old");
  assert_eq!(
    f.prepare("![](old.xls)", false)
      .expect_err("unsupported")
      .code,
    "INVALID_SPREADSHEET"
  );
  f.write("bad.csv", [0xff, 0xfe, b'x']);
  assert_eq!(
    f.prepare("![](bad.csv)", false).expect_err("encoding").code,
    "INVALID_SPREADSHEET"
  );
  f.write(
    "large.csv",
    vec![b'x'; spreadsheet::MAX_FILE_BYTES as usize + 1],
  );
  assert_eq!(
    f.prepare("![](large.csv)", false).expect_err("large").code,
    "SPREADSHEET_LIMIT"
  );
  f.write(
    "pointer.xlsx",
    b"version https://git-lfs.github.com/spec/v1\n",
  );
  assert!(
    f.prepare("![](pointer.xlsx)", false)
      .expect_err("LFS")
      .message
      .contains("Git LFS")
  );
}

#[test]
fn root_traversal_and_symlinks_cannot_import_outside_files() {
  let f = Fixture::new();
  let outside = Fixture::new();
  outside.write("secret.csv", "secret");
  let relative = format!(
    "../{}/secret.csv",
    outside.0.file_name().expect("name").to_string_lossy()
  );
  assert_eq!(
    f.prepare(&format!("![]({relative})"), false)
      .expect_err("traversal")
      .code,
    "INVALID_PATH"
  );
  #[cfg(unix)]
  {
    std::os::unix::fs::symlink(outside.0.join("secret.csv"), f.0.join("secret.csv"))
      .expect("symlink");
    assert_eq!(
      f.prepare("![](secret.csv)", false)
        .expect_err("symlink")
        .code,
      "INVALID_PATH"
    );
  }
}

#[test]
fn truncated_rows_are_reported_and_import_tables_render_in_epub_and_html() {
  let f = Fixture::new();
  f.write("data.csv", "a,b\n".repeat(501));
  let expanded = f.prepare("![](data.csv)", false).expect("expand");
  assert!(expanded.contains("content was truncated"));
  let document = SourceDocument {
    path: "input.md".into(),
    title: "Imported".into(),
    markdown: expanded,
    assets: BTreeMap::new(),
  };
  for format in [
    ExportFormat::Html,
    ExportFormat::Epub,
    ExportFormat::Txt,
    ExportFormat::Markdown,
  ] {
    let bytes = crate::render(
      format,
      std::slice::from_ref(&document),
      &PublicationOptions::document(format, "Imported".into()),
      &CancellationToken::new(),
    )
    .expect("render");
    if format == ExportFormat::Epub {
      let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("EPUB archive");
      let mut found = false;
      for index in 0..archive.len() {
        let mut entry = archive.by_index(index).expect("entry");
        if !entry.name().expect("name").ends_with(".xhtml") {
          continue;
        }
        let mut xml = String::new();
        entry.read_to_string(&mut xml).expect("XML");
        let mut reader = quick_xml::Reader::from_str(&xml);
        loop {
          if reader.read_event().expect("valid XML") == quick_xml::events::Event::Eof {
            break;
          }
        }
        found |= xml.contains("<table>") && xml.contains("truncated");
      }
      assert!(found, "EPUB contains spreadsheet table");
    } else {
      assert!(
        String::from_utf8(bytes)
          .expect("text")
          .contains("truncated")
      );
    }
  }
}

#[test]
fn chinese_output_labels_warnings_and_deduplication_preserve_distinct_workbooks() {
  let f = Fixture::new();
  f.write("first.xlsx", workbook());
  f.write("second.xlsx", workbook());
  let expanded = prepare(
    &f.0,
    &f.0,
    "[First](first.xlsx) [Again](first.xlsx) [Second](second.xlsx)",
    true,
    "zh-CN",
    &CancellationToken::new(),
  )
  .expect("expand");
  assert_eq!(expanded.matches("## first.xlsx").count(), 1);
  assert_eq!(expanded.matches("## second.xlsx").count(), 1);
  assert!(expanded.contains("第 1 列"));
  assert!(expanded.contains("公式无已保存值"));
  assert!(expanded.contains("警告："));
  assert!(!expanded.contains("Column "));
}
