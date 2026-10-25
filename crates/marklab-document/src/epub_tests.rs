use super::*;
use crate::types::ExportFormat;
use quick_xml::{Reader, events::Event};
use std::{
  collections::{BTreeMap, BTreeSet},
  io::Read,
};

fn source(path: &str, title: &str, markdown: &str) -> SourceDocument {
  SourceDocument {
    path: path.into(),
    title: title.into(),
    markdown: markdown.into(),
    assets: BTreeMap::new(),
  }
}

fn entries(bytes: &[u8]) -> BTreeMap<String, Vec<u8>> {
  let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).expect("EPUB ZIP");
  let mut entries = BTreeMap::new();
  for index in 0..archive.len() {
    let mut entry = archive.by_index(index).expect("ZIP entry");
    let mut bytes = Vec::new();
    entry.read_to_end(&mut bytes).expect("entry contents");
    entries.insert(entry.name().expect("entry name").into_owned(), bytes);
  }
  entries
}

fn xml(entries: &BTreeMap<String, Vec<u8>>, name: &str) -> String {
  String::from_utf8(entries[name].clone()).expect("UTF-8 XML")
}

fn attributes(value: &str, element_name: &str) -> Vec<BTreeMap<String, String>> {
  let mut reader = Reader::from_str(value);
  let mut result = Vec::new();
  loop {
    match reader.read_event().expect("well-formed XML") {
      Event::Start(element) | Event::Empty(element) => {
        let attributes = element
          .attributes()
          .map(|attribute| {
            let attribute = attribute.expect("XML attribute");
            (
              attribute.key.as_ref().to_owned(),
              attribute
                .normalized_value(quick_xml::XmlVersion::Implicit1_0)
                .expect("attribute value")
                .into_owned(),
            )
          })
          .collect::<BTreeMap<_, _>>();
        if element_name.is_empty() || element.name().as_ref() == element_name {
          result.push(attributes);
        }
      }
      Event::Eof => break,
      _ => (),
    }
  }
  result
}

fn validate_references(entries: &BTreeMap<String, Vec<u8>>) {
  for (name, bytes) in entries.iter().filter(|(name, _)| name.ends_with(".xhtml")) {
    let value = std::str::from_utf8(bytes).expect("XHTML");
    let elements = attributes(value, "");
    let ids = elements
      .iter()
      .filter_map(|attributes| attributes.get("id"))
      .collect::<Vec<_>>();
    assert_eq!(
      ids.len(),
      ids.iter().collect::<BTreeSet<_>>().len(),
      "duplicate IDs in {name}"
    );
    for attribute in elements {
      for key in ["href", "src"] {
        let Some(url) = attribute.get(key) else {
          continue;
        };
        if markdown::safe_link(url) {
          continue;
        }
        let (path, fragment) = url
          .split_once('#')
          .map_or((url.as_str(), None), |(path, fragment)| {
            (path, Some(fragment))
          });
        let target = if path.is_empty() {
          name.clone()
        } else {
          format!("EPUB/{path}")
        };
        assert!(
          entries.contains_key(&target),
          "missing target {url} in {name}"
        );
        if let Some(fragment) = fragment {
          let ids = attributes(&xml(entries, &target), "");
          assert!(
            ids
              .iter()
              .any(|attributes| attributes.get("id").is_some_and(|id| id == fragment)),
            "missing fragment {url} in {name}"
          );
        }
      }
    }
  }
}

#[test]
fn epub3_package_has_ocf_metadata_navigation_order_and_safe_local_links() {
  let documents = [
    source(
      "/book/one.md",
      "One & <title>",
      "# One\n\n## Repeat\n\n## Repeat\n\n## Repeat-1\n\n[second](sub/two%20words.md#%E4%B8%AD%E6%96%87) [self](#repeat-1) [web](https://example.test?a=1&b=2) [bad](javascript:alert) [absent](absent.md)\n\nText.[^n] Again.[^n]\n\n[^n]: Note.\n\n![Missing chart](missing.png)\n\n<script>alert('bad')</script>",
    ),
    source(
      "/book/sub/two words.md",
      "Two",
      "# Two\n\n## 中文\n\n[back](../one.md#One)\n\nOther.[^n]\n\n[^n]: Second note.\n\nControl: \u{1} end.",
    ),
  ];
  let mut options = PublicationOptions::document(ExportFormat::Epub, "Book & <safe>\u{0}".into());
  options.cover = true;
  let bytes = render(&documents, &options, &CancellationToken::new()).expect("EPUB");
  assert_eq!(&bytes[0..4], b"PK\x03\x04");
  assert_eq!(
    u16::from_le_bytes([bytes[8], bytes[9]]),
    0,
    "mimetype stored"
  );
  assert_eq!(
    u16::from_le_bytes([bytes[28], bytes[29]]),
    0,
    "mimetype no extra fields"
  );
  assert_eq!(&bytes[30..38], b"mimetype");
  assert_eq!(&bytes[38..58], b"application/epub+zip");
  let entries = entries(&bytes);
  assert_eq!(entries["mimetype"], b"application/epub+zip");
  for (name, bytes) in &entries {
    if name.ends_with(".xml") || name.ends_with(".opf") || name.ends_with(".xhtml") {
      attributes(std::str::from_utf8(bytes).expect("XML UTF-8"), "");
    }
  }
  assert!(xml(&entries, "META-INF/container.xml").contains("full-path=\"EPUB/package.opf\""));
  let package = xml(&entries, "EPUB/package.opf");
  assert!(package.contains("version=\"3.0\" unique-identifier=\"publication-id\""));
  assert!(package.contains("urn:uuid:"));
  assert!(package.contains("<dc:title>Book &amp; &lt;safe&gt;</dc:title>"));
  assert!(package.contains("<dc:language>en-US</dc:language>"));
  assert!(package.contains("property=\"dcterms:modified\""));
  let manifest = attributes(&package, "item");
  for item in &manifest {
    assert!(entries.contains_key(&format!("EPUB/{}", item["href"])));
  }
  assert!(manifest.iter().any(|item| {
    item
      .get("properties")
      .is_some_and(|properties| properties == "nav")
  }));
  let order = attributes(&package, "itemref")
    .iter()
    .map(|item| item["idref"].clone())
    .collect::<Vec<_>>();
  assert_eq!(order, ["cover", "chapter-0", "chapter-1"]);
  let nav = xml(&entries, "EPUB/nav.xhtml");
  assert!(nav.contains("epub:type=\"toc\""));
  assert!(
    nav.find("chapter-0.xhtml").expect("first") < nav.find("chapter-1.xhtml").expect("second")
  );
  let first = xml(&entries, "EPUB/chapter-0.xhtml");
  assert_eq!(
    first.matches("<h1 ").count(),
    1,
    "no duplicate chapter title"
  );
  assert!(first.contains("href=\"chapter-1.xhtml#heading-中文\""));
  assert!(first.contains("href=\"chapter-0.xhtml#heading-repeat-1\""));
  assert!(first.contains("href=\"https://example.test?a=1&amp;b=2\""));
  assert!(first.contains("Image unavailable: Missing chart"));
  assert!(!first.contains("javascript:"));
  assert!(!first.contains("<script"));
  assert!(!first.contains("href=\"absent.md"));
  assert!(!xml(&entries, "EPUB/chapter-1.xhtml").contains('\u{1}'));
  validate_references(&entries);
}

#[test]
fn epub_embeds_local_images_and_static_math_and_can_show_contents() {
  let mut document = source(
    "notes.md",
    "Rich",
    "# Rich\n\n![Chart](chart.png)\n\n![Again](chart.png)\n\nInline $x^2$ and display:\n\n$$\n\\frac{1}{2}\n$$\n\n| A | B |\n| - | - |\n| one | two |",
  );
  document.assets.insert(
    "chart.png".into(),
    include_bytes!("fixtures/chart.png").to_vec(),
  );
  let mut options = PublicationOptions::document(ExportFormat::Epub, "Rich".into());
  options.table_of_contents = true;
  let entries =
    entries(&render(&[document], &options, &CancellationToken::new()).expect("rich EPUB"));
  let images = entries
    .iter()
    .filter(|(name, _)| name.starts_with("EPUB/images/"))
    .collect::<Vec<_>>();
  assert_eq!(
    images.len(),
    3,
    "source image is shared; two equations are rasterized"
  );
  for (_, bytes) in images {
    assert!(bytes.starts_with(b"\x89PNG\r\n\x1a\n"));
  }
  let chapter = xml(&entries, "EPUB/chapter-0.xhtml");
  assert!(!chapter.contains("data:"));
  assert!(chapter.contains("class=\"math\""));
  assert!(chapter.contains(
    "<thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>one</td><td>two</td></tr></tbody>"
  ));
  let package = xml(&entries, "EPUB/package.opf");
  let order = attributes(&package, "itemref")
    .iter()
    .map(|item| item["idref"].clone())
    .collect::<Vec<_>>();
  assert_eq!(order, ["nav", "chapter-0"]);
  validate_references(&entries);
}

#[test]
fn epub_cancellation_prevents_even_an_empty_archive() {
  let cancelled = CancellationToken::new();
  cancelled.cancel();
  let options = PublicationOptions::document(ExportFormat::Epub, "Cancelled".into());
  assert_eq!(
    render(&[], &options, &cancelled)
      .expect_err("cancelled")
      .code,
    "EXPORT_CANCELLED"
  );
  assert_eq!(
    render(&[], &options, &CancellationToken::new())
      .expect_err("empty EPUB")
      .code,
    "INVALID_DOCUMENT"
  );
}
