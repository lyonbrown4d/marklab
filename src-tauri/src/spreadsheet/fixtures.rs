use std::io::{Cursor, Read, Write};

pub fn xlsx(sheet_data: &str, shared_strings: Option<&str>) -> Vec<u8> {
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
      "xl/workbook.xml",
      r#"<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets></workbook>"#,
    ),
    (
      "xl/_rels/workbook.xml.rels",
      r#"<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>"#,
    ),
    (
      "xl/styles.xml",
      r#"<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>"#,
    ),
    ("xl/worksheets/sheet1.xml", sheet_data),
    (
      "xl/worksheets/sheet2.xml",
      r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><v>42</v></c></row></sheetData></worksheet>"#,
    ),
  ];
  for (name, source) in entries {
    zip
      .start_file(name, zip::write::SimpleFileOptions::default())
      .unwrap();
    zip.write_all(source.as_bytes()).unwrap();
  }
  if let Some(source) = shared_strings {
    zip
      .start_file(
        "xl/sharedStrings.xml",
        zip::write::SimpleFileOptions::default(),
      )
      .unwrap();
    zip.write_all(source.as_bytes()).unwrap();
  }
  zip.finish().unwrap().into_inner()
}

pub fn worksheet(cells: &str) -> String {
  format!(
    r#"<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{cells}</sheetData></worksheet>"#
  )
}

pub fn rename_first_sheet(bytes: &[u8]) -> Vec<u8> {
  let mut original = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
  let mut renamed = zip::ZipWriter::new(Cursor::new(Vec::new()));
  for index in 0..original.len() {
    let mut entry = original.by_index(index).unwrap();
    let mut name = entry.name().unwrap().into_owned();
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).unwrap();
    if name == "xl/worksheets/sheet1.xml" {
      name = "xl/worksheets/sheet1.bin".into();
    }
    if name == "xl/_rels/workbook.xml.rels" {
      bytes = String::from_utf8(bytes)
        .unwrap()
        .replace("worksheets/sheet1.xml", "worksheets/sheet1.bin")
        .into_bytes();
    }
    renamed
      .start_file(name, zip::write::SimpleFileOptions::default())
      .unwrap();
    renamed.write_all(&bytes).unwrap();
  }
  renamed.finish().unwrap().into_inner()
}
