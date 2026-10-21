use super::{
  ExportFormat, PublicationOptions, SourceDocument, check_cancelled,
  commands::validate_output,
  html,
  markdown::{self, Kind, Node},
  render,
};
use std::collections::BTreeMap;
use tokio_util::sync::CancellationToken;

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
  let cancelled = CancellationToken::new();
  cancelled.cancel();
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
  let document =
    source("# A < B\n\n<script>alert('bad')</script>\n\n[text](javascript:alert)\n\n`<unsafe>`");
  let options = PublicationOptions::document(ExportFormat::Html, "Title <unsafe>".into());
  let html = String::from_utf8(
    html::render(&[document], &options, &CancellationToken::new()).expect("render"),
  )
  .expect("utf8");
  assert!(html.contains("Title &lt;unsafe&gt;"));
  assert!(html.contains("&lt;unsafe&gt;"));
  assert!(!html.contains("<script>"));
  assert!(!html.contains("href=\"javascript:"));
}

#[test]
fn rich_pdf_and_docx_exports_produce_real_documents() {
  let markdown = "# 中文导出验收 Export regression\n\n中文段落验证字体回退与标点：缓存、工作区和导出。\n\nA **bold** paragraph with _emphasis_, a [link](https://example.test), and $\\frac{1}{2}$.[^note]\n\n[^note]: A real footnote，含中文脚注。\n\n![中文图表：蓝色与橙色条形](fixtures/chart.png)\n\n| Item | Value |\n| --- | --- |\n| Alpha | 42 |\n\n```rust\nlet value = 42;\n```\n\n- first\n- second";
  let mut document = source(markdown);
  document.title = "中文导出验收 Export regression".into();
  document.assets.insert(
    "fixtures/chart.png".into(),
    include_bytes!("fixtures/chart.png").to_vec(),
  );
  let cancelled = CancellationToken::new();
  let mut options = PublicationOptions::document(ExportFormat::Pdf, "Export regression".into());
  options.title = "中文导出验收 Export regression".into();
  options.locale = "zh-CN".into();
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
  std::fs::write(directory.join("rich.docx"), &docx).expect("smoke DOCX");
  let parsed = docx_rs::read_docx(&docx).expect("valid DOCX package");
  let structure = serde_json::to_string(&parsed).expect("document structure");
  assert!(structure.contains("Export regression"));
  assert!(structure.contains("Alpha"));
  assert!(structure.contains("中文段落验证字体回退与标点"));
  // docx-rs reads the main document but currently omits footnote parts. Read
  // the actual package part instead of asserting against that incomplete model.
  let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&docx)).expect("DOCX ZIP");
  let images = archive
    .file_names()
    .map(|name| name.expect("valid DOCX entry name"))
    .filter(|name| name.starts_with("word/media/") && name.ends_with(".png"))
    .count();
  assert!(
    images >= 2,
    "DOCX contains both the source PNG and rendered equation"
  );
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
  assert!(footnotes.contains("含中文脚注"));
}

#[test]
fn typst_literal_escaping_uses_native_unicode_escape_syntax() {
  let quoted = super::typst_engine::quoted("\0\u{8}#include \"private\"\\😀");
  assert!(quoted.starts_with('"') && quoted.ends_with('"'));
  assert!(quoted.contains("\\u{0}"));
  assert!(!quoted.contains("\\u0000"));
  assert!(quoted.contains("\\\"private\\\""));
}

fn docx_part(bytes: &[u8], name: &str) -> String {
  let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("DOCX ZIP");
  let mut xml = String::new();
  std::io::Read::read_to_string(&mut archive.by_name(name).expect("DOCX part"), &mut xml)
    .expect("OOXML text");
  xml
}

#[test]
fn docx_defines_visible_heading_styles_and_body_spacing() {
  let options = PublicationOptions::document(ExportFormat::Docx, "Styles".into());
  let document =
    source("# One\n\nBody\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six");
  let bytes = render(
    ExportFormat::Docx,
    &[document],
    &options,
    &CancellationToken::new(),
  )
  .expect("styled DOCX");
  let styles = docx_part(&bytes, "word/styles.xml");
  let document = docx_part(&bytes, "word/document.xml");
  for (index, size) in [32, 26, 24, 22, 22, 22].into_iter().enumerate() {
    let id = format!("Heading{}", index + 1);
    let style = styles
      .split(&format!("w:styleId=\"{id}\""))
      .nth(1)
      .expect("heading style definition")
      .split("</w:style>")
      .next()
      .expect("style body");
    let run = style
      .split("<w:rPr>")
      .nth(1)
      .expect("style run properties")
      .split("</w:rPr>")
      .next()
      .expect("run properties body");
    assert!(run.contains(&format!("<w:sz w:val=\"{size}\"")));
    assert!(run.contains("<w:b />"), "Heading must style actual runs");
    assert!(style.contains(&format!("<w:outlineLvl w:val=\"{index}\"")));
    assert!(style.contains("<w:spacing w:before=\"240\" w:after=\"120\""));
    assert!(document.contains(&format!("<w:pStyle w:val=\"{id}\"")));
  }
  let defaults = styles
    .split("<w:docDefaults>")
    .nth(1)
    .expect("document defaults")
    .split("</w:docDefaults>")
    .next()
    .expect("defaults body");
  assert!(defaults.contains("w:after=\"120\""));
  assert!(defaults.contains("w:line=\"276\""));
  assert!(defaults.contains("w:lineRule=\"auto\""));
}

fn drawing_sizes(xml: &str) -> Vec<(u64, u64)> {
  use quick_xml::{Reader, events::Event};
  let mut reader = Reader::from_str(xml);
  let mut sizes = Vec::new();
  loop {
    match reader.read_event().expect("valid drawing XML") {
      Event::Empty(element) if element.name().as_ref() == "wp:extent" => {
        let attributes: BTreeMap<_, _> = element
          .attributes()
          .map(|value| {
            let attribute = value.expect("drawing attribute");
            (
              attribute.key.as_ref().to_owned(),
              attribute.value.parse::<u64>().expect("EMU dimension"),
            )
          })
          .collect();
        sizes.push((attributes["cx"], attributes["cy"]));
      }
      Event::Eof => break,
      _ => (),
    }
  }
  sizes
}

#[test]
fn docx_images_and_footnotes_fit_narrow_page_text_area_without_stretching() {
  let mut options = PublicationOptions::document(ExportFormat::Docx, "Images".into());
  options.page_size = "a5".into();
  options.margin = "wide".into();
  let mut document =
    source("# Images\n\n![chart](chart.png)\n\nFootnote.[^image]\n\n[^image]: ![chart](chart.png)");
  document.assets.insert(
    "chart.png".into(),
    include_bytes!("fixtures/chart.png").to_vec(),
  );
  let bytes = render(
    ExportFormat::Docx,
    &[document],
    &options,
    &CancellationToken::new(),
  )
  .expect("bounded DOCX images");
  let mut archive = zip::ZipArchive::new(std::io::Cursor::new(&bytes)).expect("DOCX ZIP");
  let image_name = archive
    .file_names()
    .map(|name| name.expect("valid DOCX entry name"))
    .find(|name| name.starts_with("word/media/") && name.ends_with(".png"))
    .expect("embedded chart")
    .into_owned();
  let mut png = Vec::new();
  std::io::Read::read_to_end(
    &mut archive.by_name(&image_name).expect("image part"),
    &mut png,
  )
  .expect("PNG bytes");
  let image = imagesize::blob_size(&png).expect("raster dimensions");
  let aspect_ratio = image.width as f64 / image.height as f64;
  let text_width_pt = (148.0 - 2.0 * 26.0) / 25.4 * 72.0;
  for name in ["word/document.xml", "word/footnotes.xml"] {
    let sizes = drawing_sizes(&docx_part(&bytes, name));
    assert_eq!(sizes.len(), 1, "Expected image in {name}");
    let (width, height) = sizes[0];
    assert!(width > 0 && width <= (text_width_pt * 12700.0) as u64);
    assert!(
      (width as f64 / height as f64 - aspect_ratio).abs() < 0.01,
      "Preserve chart aspect ratio"
    );
  }
}
