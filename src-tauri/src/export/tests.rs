use super::{ExportFormat, commands::validate_output};

#[test]
fn export_validates_output_extensions() {
  for format in [
    ExportFormat::Pdf,
    ExportFormat::Docx,
    ExportFormat::Html,
    ExportFormat::Txt,
    ExportFormat::Epub,
  ] {
    let path = std::env::temp_dir().join(format!("example.{}", format.extension()));
    assert!(validate_output(&path.to_string_lossy(), format).is_ok());
  }
  let mismatch = std::env::temp_dir().join("example.html");
  assert!(validate_output(&mismatch.to_string_lossy(), ExportFormat::Pdf).is_err());
  assert!(validate_output("relative.pdf", ExportFormat::Pdf).is_err());
}
