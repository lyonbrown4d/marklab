use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
  Pdf,
  Docx,
  Html,
  Markdown,
  Txt,
  Epub,
}

impl ExportFormat {
  pub fn extension(self) -> &'static str {
    match self {
      Self::Pdf => "pdf",
      Self::Docx => "docx",
      Self::Html => "html",
      Self::Markdown => "md",
      Self::Txt => "txt",
      Self::Epub => "epub",
    }
  }
}
#[derive(Clone, Debug, Deserialize)]
#[cfg_attr(feature = "specta", derive(specta::Type))]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicationOptions {
  pub cover: bool,
  #[serde(default)]
  pub include_linked_spreadsheets: bool,
  pub format: ExportFormat,
  pub locale: String,
  pub margin: String,
  pub orientation: String,
  pub page_breaks: bool,
  pub page_numbers: bool,
  pub page_size: String,
  pub table_of_contents: bool,
  pub title: String,
}

impl PublicationOptions {
  pub fn document(format: ExportFormat, title: String) -> Self {
    Self {
      cover: false,
      include_linked_spreadsheets: false,
      format,
      locale: "en-US".into(),
      margin: "normal".into(),
      orientation: "portrait".into(),
      page_breaks: false,
      page_numbers: true,
      page_size: "a4".into(),
      table_of_contents: false,
      title,
    }
  }

  pub fn validate(&self) -> BackendResult<()> {
    if self.title.trim().is_empty()
      || self.title.chars().count() > 200
      || !["en-US", "zh-CN"].contains(&self.locale.as_str())
      || !["normal", "narrow", "wide"].contains(&self.margin.as_str())
      || !["portrait", "landscape"].contains(&self.orientation.as_str())
      || !["a4", "a5", "letter"].contains(&self.page_size.as_str())
    {
      return Err(BackendError::new(
        "INVALID_REQUEST",
        "Invalid publication options",
      ));
    }
    Ok(())
  }

  pub fn margin_mm(&self) -> u32 {
    match self.margin.as_str() {
      "narrow" => 12,
      "wide" => 26,
      _ => 18,
    }
  }
  pub fn dimensions_mm(&self) -> (f64, f64) {
    let (w, h) = match self.page_size.as_str() {
      "a5" => (148.0, 210.0),
      "letter" => (215.9, 279.4),
      _ => (210.0, 297.0),
    };
    if self.orientation == "landscape" {
      (h, w)
    } else {
      (w, h)
    }
  }
}

#[derive(Clone, Debug)]
pub struct SourceDocument {
  pub path: String,
  pub title: String,
  pub markdown: String,
  pub assets: BTreeMap<String, Vec<u8>>,
}
