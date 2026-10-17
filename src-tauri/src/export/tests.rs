use super::{
    ExportFormat, PublicationOptions, SourceDocument, check_cancelled,
    commands::validate_output,
    html,
    markdown::{self, Kind, Node},
    render,
};
use std::collections::BTreeMap;
use std::sync::atomic::AtomicBool;

fn source(markdown: &str) -> SourceDocument {
    SourceDocument {
        path: "notes.md".into(),
        title: "Export regression".into(),
        markdown: markdown.into(),
        assets: BTreeMap::new(),
    }
}

#[test]
fn markdown_retains_nested_styles_tables_footnotes_and_tex_math() {
    let parsed = markdown::parse("# Heading\n\n**bold** and $x^2$.[^a]\n\n[^a]: Footnote\n\n| A | B |\n| - | - |\n| one | two |\n\n- [x] done\n  - nested").expect("valid markdown");
    assert!(matches!(&parsed[0], Node::Element(Kind::Heading(1), _)));
    assert_eq!(
        markdown::plain(&markdown::footnotes(&parsed)["a"]),
        "Footnote"
    );
    assert!(
        parsed
            .iter()
            .any(|node| matches!(node, Node::Element(Kind::Table(2), _)))
    );
    assert!(markdown::plain(&parsed).contains("x^2"));
    assert!(!markdown::safe_link("javascript:alert(1)"));
    assert!(markdown::safe_link("https://example.test"));
}

#[test]
fn export_validates_output_extensions_and_cancellation_before_rendering() {
    assert!(validate_output("/tmp/example.pdf", ExportFormat::Pdf).is_ok());
    assert!(validate_output("/tmp/example.html", ExportFormat::Pdf).is_err());
    assert!(validate_output("relative.pdf", ExportFormat::Pdf).is_err());
    let cancelled = AtomicBool::new(true);
    assert_eq!(
        check_cancelled(&cancelled).expect_err("cancelled").code,
        "EXPORT_CANCELLED"
    );
    let options = PublicationOptions::document(ExportFormat::Pdf, "Title".into());
    assert_eq!(
        render(ExportFormat::Pdf, &[source("text")], &options, &cancelled)
            .expect_err("cancelled")
            .code,
        "EXPORT_CANCELLED"
    );
}

#[test]
fn html_export_escapes_untrusted_content_and_omits_executable_html() {
    let document = source(
        "# A < B\n\n<script>alert('bad')</script>\n\n[text](javascript:alert)\n\n`<unsafe>`",
    );
    let options = PublicationOptions::document(ExportFormat::Html, "Title <unsafe>".into());
    let html = String::from_utf8(
        html::render(&[document], &options, &AtomicBool::new(false)).expect("render"),
    )
    .expect("utf8");
    assert!(html.contains("Title &lt;unsafe&gt;"));
    assert!(html.contains("&lt;unsafe&gt;"));
    assert!(!html.contains("<script>"));
    assert!(!html.contains("href=\"javascript:"));
}

#[test]
fn rich_pdf_and_docx_exports_produce_real_documents() {
    let markdown = "# Export regression\n\nA **bold** paragraph with _emphasis_, a [link](https://example.test), and $\\frac{1}{2}$.[^note]\n\n[^note]: A real footnote.\n\n| Item | Value |\n| --- | --- |\n| Alpha | 42 |\n\n```rust\nlet value = 42;\n```\n\n- first\n- second";
    let document = source(markdown);
    let cancelled = AtomicBool::new(false);
    let mut options = PublicationOptions::document(ExportFormat::Pdf, "Export regression".into());
    options.cover = true;
    options.table_of_contents = true;
    let pdf = render(
        ExportFormat::Pdf,
        std::slice::from_ref(&document),
        &options,
        &cancelled,
    )
    .expect("rich PDF export");
    assert!(pdf.starts_with(b"%PDF-"));
    assert!(pdf.len() > 2000);
    let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("target/export-smoke");
    std::fs::create_dir_all(&directory).expect("smoke directory");
    std::fs::write(directory.join("rich.pdf"), pdf).expect("smoke PDF");
    options.format = ExportFormat::Docx;
    let docx =
        render(ExportFormat::Docx, &[document], &options, &cancelled).expect("rich DOCX export");
    assert!(docx.starts_with(b"PK"));
    let parsed = docx_rs::read_docx(&docx).expect("valid DOCX package");
    let structure = serde_json::to_string(&parsed).expect("document structure");
    assert!(structure.contains("Export regression"));
    assert!(structure.contains("Alpha"));
    // docx-rs reads the main document but currently omits footnote parts. Read
    // the actual package part instead of asserting against that incomplete model.
    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&docx)).expect("DOCX ZIP");
    let mut footnotes = String::new();
    std::io::Read::read_to_string(
        &mut archive
            .by_name("word/footnotes.xml")
            .expect("footnotes part"),
        &mut footnotes,
    )
    .expect("footnotes XML");
    assert!(footnotes.contains("A real footnote"));
    assert!(footnotes.contains("w:footnote"));
    std::fs::write(directory.join("rich.docx"), docx).expect("smoke DOCX");
}

#[test]
fn typst_literal_escaping_uses_native_unicode_escape_syntax() {
    let quoted = super::typst_engine::quoted("\0\u{8}#include \"private\"\\😀");
    assert!(quoted.starts_with('"') && quoted.ends_with('"'));
    assert!(quoted.contains("\\u{0}"));
    assert!(!quoted.contains("\\u0000"));
    assert!(quoted.contains("\\\"private\\\""));
}
