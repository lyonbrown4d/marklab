use crate::{
  check_cancelled,
  error::{BackendError, BackendResult},
  markdown,
  types::{PublicationOptions, SourceDocument},
};
use std::io::{Cursor, Write};
use tokio_util::sync::CancellationToken;
use zip::{CompressionMethod, ZipWriter, write::SimpleFileOptions};

#[path = "epub_content.rs"]
mod content;
#[path = "epub_links.rs"]
mod links;

pub(super) struct Resource {
  name: String,
  bytes: Vec<u8>,
}

// XML 1.0 permits only these scalar values; Markdown text and metadata are untrusted.
pub(super) fn escape(value: &str) -> String {
  let mut result = String::with_capacity(value.len());
  for character in value.chars().filter(|character| matches!(*character,
    '\u{9}' | '\u{A}' | '\u{D}' | '\u{20}'..='\u{D7FF}' | '\u{E000}'..='\u{FFFD}' | '\u{10000}'..='\u{10FFFF}')) {
    match character {
      '&' => result.push_str("&amp;"), '<' => result.push_str("&lt;"),
      '>' => result.push_str("&gt;"), '"' => result.push_str("&quot;"),
      '\'' => result.push_str("&apos;"), _ => result.push(character),
    }
  }
  result
}

pub(super) fn xhtml(title: &str, locale: &str, body: &str) -> String {
  format!(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?><!DOCTYPE html><html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\" lang=\"{}\" xml:lang=\"{}\"><head><meta charset=\"utf-8\"/><title>{}</title><link rel=\"stylesheet\" type=\"text/css\" href=\"style.css\"/></head><body>{body}</body></html>",
    escape(locale),
    escape(locale),
    escape(title)
  )
}

pub fn render(
  documents: &[SourceDocument],
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<u8>> {
  check_cancelled(cancelled)?;
  if documents.is_empty() {
    return Err(BackendError::new(
      "INVALID_DOCUMENT",
      "EPUB requires at least one chapter",
    ));
  }
  let nodes = documents
    .iter()
    .map(|document| {
      check_cancelled(cancelled)?;
      markdown::parse(&document.markdown)
    })
    .collect::<BackendResult<Vec<_>>>()?;
  let links = links::chapters(documents, &nodes);
  let mut resources = Vec::new();
  let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
  // OCF requires mimetype to be the first entry, stored with no extra fields.
  write(
    &mut archive,
    "mimetype",
    b"application/epub+zip",
    CompressionMethod::Stored,
  )?;
  write(&mut archive, "META-INF/container.xml", b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"EPUB/package.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>", CompressionMethod::Deflated)?;
  write(
    &mut archive,
    "EPUB/nav.xhtml",
    navigation(documents, options).as_bytes(),
    CompressionMethod::Deflated,
  )?;
  write(
    &mut archive,
    "EPUB/style.css",
    stylesheet(options).as_bytes(),
    CompressionMethod::Deflated,
  )?;
  if options.cover {
    let cover = xhtml(
      &options.title,
      &options.locale,
      &format!(
        "<section epub:type=\"titlepage\"><h1>{}</h1></section>",
        escape(&options.title)
      ),
    );
    write(
      &mut archive,
      "EPUB/cover.xhtml",
      cover.as_bytes(),
      CompressionMethod::Deflated,
    )?;
  }
  for (index, (document, nodes)) in documents.iter().zip(&nodes).enumerate() {
    check_cancelled(cancelled)?;
    let first_resource = resources.len();
    let chapter = content::chapter(
      document,
      nodes,
      index,
      &links,
      &mut resources,
      options,
      cancelled,
    )?;
    write(
      &mut archive,
      &format!("EPUB/chapter-{index}.xhtml"),
      chapter.as_bytes(),
      CompressionMethod::Deflated,
    )?;
    // Retain manifest names while releasing rendered image bytes after each chapter.
    for resource in &mut resources[first_resource..] {
      check_cancelled(cancelled)?;
      write(
        &mut archive,
        &format!("EPUB/{}", resource.name),
        &resource.bytes,
        CompressionMethod::Deflated,
      )?;
      resource.bytes = Vec::new();
    }
  }
  write(
    &mut archive,
    "EPUB/package.opf",
    package(documents, options, &resources).as_bytes(),
    CompressionMethod::Deflated,
  )?;
  check_cancelled(cancelled)?;
  archive
    .finish()
    .map(|cursor| cursor.into_inner())
    .map_err(zip_error)
}

fn write(
  archive: &mut ZipWriter<Cursor<Vec<u8>>>,
  name: &str,
  bytes: &[u8],
  method: CompressionMethod,
) -> BackendResult<()> {
  archive
    .start_file(
      name,
      SimpleFileOptions::default().compression_method(method),
    )
    .map_err(zip_error)?;
  archive
    .write_all(bytes)
    .map_err(|error| BackendError::new("EXPORT_RENDER_FAILED", format!("EPUB: {error}")))
}

fn zip_error(error: zip::result::ZipError) -> BackendError {
  BackendError::new("EXPORT_RENDER_FAILED", format!("EPUB archive: {error}"))
}

fn package(
  documents: &[SourceDocument],
  options: &PublicationOptions,
  resources: &[Resource],
) -> String {
  let mut manifest = String::from(
    "<item id=\"nav\" href=\"nav.xhtml\" media-type=\"application/xhtml+xml\" properties=\"nav\"/><item id=\"style\" href=\"style.css\" media-type=\"text/css\"/>",
  );
  let mut spine = String::new();
  if options.cover {
    manifest
      .push_str("<item id=\"cover\" href=\"cover.xhtml\" media-type=\"application/xhtml+xml\"/>");
    spine.push_str("<itemref idref=\"cover\"/>");
  }
  if options.table_of_contents {
    spine.push_str("<itemref idref=\"nav\"/>");
  }
  for index in 0..documents.len() {
    manifest.push_str(&format!("<item id=\"chapter-{index}\" href=\"chapter-{index}.xhtml\" media-type=\"application/xhtml+xml\"/>"));
    spine.push_str(&format!("<itemref idref=\"chapter-{index}\"/>"));
  }
  for (index, resource) in resources.iter().enumerate() {
    manifest.push_str(&format!(
      "<item id=\"image-{index}\" href=\"{}\" media-type=\"image/png\"/>",
      escape(&resource.name)
    ));
  }
  format!(
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?><package xmlns=\"http://www.idpf.org/2007/opf\" version=\"3.0\" unique-identifier=\"publication-id\"><metadata xmlns:dc=\"http://purl.org/dc/elements/1.1/\"><dc:identifier id=\"publication-id\">urn:uuid:{}</dc:identifier><dc:title>{}</dc:title><dc:language>{}</dc:language><meta property=\"dcterms:modified\">{}</meta></metadata><manifest>{manifest}</manifest><spine>{spine}</spine></package>",
    uuid::Uuid::new_v4(),
    escape(&options.title),
    escape(&options.locale),
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ")
  )
}

fn navigation(documents: &[SourceDocument], options: &PublicationOptions) -> String {
  let label = if options.locale == "zh-CN" {
    "目录"
  } else {
    "Contents"
  };
  let mut body = format!("<nav epub:type=\"toc\" id=\"toc\"><h1>{label}</h1><ol>");
  for (index, document) in documents.iter().enumerate() {
    body.push_str(&format!(
      "<li><a href=\"chapter-{index}.xhtml#chapter-{index}\">{}</a></li>",
      escape(&document.title)
    ));
  }
  body.push_str("</ol></nav>");
  xhtml(label, &options.locale, &body)
}

fn stylesheet(options: &PublicationOptions) -> String {
  let chapter_break = if options.page_breaks {
    "section.chapter{break-before:page}"
  } else {
    ""
  };
  format!(
    "body{{font-family:serif;line-height:1.6;margin:1em}}h1,h2,h3,h4,h5,h6{{line-height:1.25;break-after:avoid}}img{{max-width:100%;height:auto}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}table{{border-collapse:collapse;width:100%}}th,td{{border:1px solid;padding:.4em;text-align:left}}blockquote{{border-left:.2em solid;padding-left:1em}}.math{{vertical-align:middle}}.display-math{{display:block;text-align:center}}aside{{font-size:.9em}}{chapter_break}"
  )
}

#[cfg(test)]
#[path = "epub_tests.rs"]
mod tests;
