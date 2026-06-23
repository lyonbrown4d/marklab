use std::collections::HashMap;

use serde::Serialize;

use crate::markdown_extract::{
  extract_markdown, MarkdownExtraction, MarkdownHeading, MarkdownLink,
};

#[derive(Default)]
pub(crate) struct MarkdownDocumentStore {
  documents: HashMap<String, MarkdownOpenDocument>,
}

impl MarkdownDocumentStore {
  pub(crate) fn open_or_change(
    &mut self,
    path: String,
    content: String,
    version: Option<u64>,
  ) -> MarkdownDocumentSnapshot {
    let extraction = extract_markdown(&path, &content);
    self.documents.insert(
      path.clone(),
      MarkdownOpenDocument {
        version,
        extraction,
      },
    );
    self
      .snapshot(&path)
      .unwrap_or_else(|| MarkdownDocumentSnapshot::empty(path, version))
  }

  pub(crate) fn close(&mut self, path: &str) -> bool {
    self.documents.remove(path).is_some()
  }

  pub(crate) fn document_symbols(&self, path: &str) -> Vec<MarkdownDocumentSymbol> {
    self
      .documents
      .get(path)
      .map(|document| {
        document
          .extraction
          .headings
          .iter()
          .map(symbol_for_heading)
          .collect()
      })
      .unwrap_or_default()
  }

  pub(crate) fn links(&self, path: &str) -> Vec<MarkdownLink> {
    self
      .documents
      .get(path)
      .map(|document| document.extraction.links.clone())
      .unwrap_or_default()
  }

  fn snapshot(&self, path: &str) -> Option<MarkdownDocumentSnapshot> {
    self.documents.get(path).map(|document| {
      MarkdownDocumentSnapshot::from_extraction(&document.extraction, document.version)
    })
  }
}

struct MarkdownOpenDocument {
  version: Option<u64>,
  extraction: MarkdownExtraction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownDocumentSnapshot {
  pub(crate) path: String,
  pub(crate) version: Option<u64>,
  pub(crate) heading_count: usize,
  pub(crate) link_count: usize,
}

impl MarkdownDocumentSnapshot {
  fn from_extraction(extraction: &MarkdownExtraction, version: Option<u64>) -> Self {
    Self {
      path: extraction.path.clone(),
      version,
      heading_count: extraction.headings.len(),
      link_count: extraction.links.len(),
    }
  }

  fn empty(path: String, version: Option<u64>) -> Self {
    Self {
      path,
      version,
      heading_count: 0,
      link_count: 0,
    }
  }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MarkdownDocumentSymbol {
  pub(crate) name: String,
  pub(crate) kind: u8,
  pub(crate) level: u8,
  pub(crate) slug: String,
  pub(crate) line: usize,
  pub(crate) column: usize,
}

fn symbol_for_heading(heading: &MarkdownHeading) -> MarkdownDocumentSymbol {
  MarkdownDocumentSymbol {
    name: heading.text.clone(),
    kind: 12,
    level: heading.level,
    slug: heading.slug.clone(),
    line: heading.line,
    column: heading.column,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn opens_document_and_returns_snapshot() {
    let mut store = MarkdownDocumentStore::default();

    let snapshot = store.open_or_change(
      "notes/a.md".to_string(),
      "# Alpha\nSee [Beta](beta.md)".to_string(),
      Some(7),
    );

    assert_eq!(snapshot.path, "notes/a.md");
    assert_eq!(snapshot.version, Some(7));
    assert_eq!(snapshot.heading_count, 1);
    assert_eq!(snapshot.link_count, 1);
  }

  #[test]
  fn exposes_symbols_and_links_from_open_document() {
    let mut store = MarkdownDocumentStore::default();
    store.open_or_change(
      "notes/a.md".to_string(),
      "# Alpha\nSee [[Beta]]".to_string(),
      None,
    );

    let symbols = store.document_symbols("notes/a.md");
    let links = store.links("notes/a.md");

    assert_eq!(symbols.len(), 1);
    assert_eq!(symbols[0].name, "Alpha");
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].target, "Beta");
  }

  #[test]
  fn change_replaces_previous_extraction() {
    let mut store = MarkdownDocumentStore::default();
    store.open_or_change("notes/a.md".to_string(), "# Alpha".to_string(), Some(1));
    store.open_or_change(
      "notes/a.md".to_string(),
      "# Beta\n## Gamma".to_string(),
      Some(2),
    );

    let symbols = store.document_symbols("notes/a.md");

    assert_eq!(symbols.len(), 2);
    assert_eq!(symbols[0].name, "Beta");
  }

  #[test]
  fn close_removes_overlay_document() {
    let mut store = MarkdownDocumentStore::default();
    store.open_or_change("notes/a.md".to_string(), "# Alpha".to_string(), None);

    assert!(store.close("notes/a.md"));
    assert!(store.document_symbols("notes/a.md").is_empty());
    assert!(!store.close("notes/a.md"));
  }
}
