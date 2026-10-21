use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
  Pdf,
  Docx,
  Html,
  Markdown,
}

impl ExportFormat {
  pub fn extension(self) -> &'static str {
    match self {
      Self::Pdf => "pdf",
      Self::Docx => "docx",
      Self::Html => "html",
      Self::Markdown => "md",
    }
  }
}
pub use ExportMarkdownRequest as MarkdownRequest;

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportMarkdownRequest {
  pub format: ExportFormat,
  pub output_path: String,
  pub source_document_path: String,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChapterRequest {
  pub path: String,
  pub title: String,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicationRequest {
  pub chapters: Vec<ChapterRequest>,
  pub options: PublicationOptions,
  pub output_path: String,
}

#[derive(Clone, Debug, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PublicationOptions {
  pub cover: bool,
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

#[derive(Clone, Serialize, specta::Type)]
pub struct ExportTaskEvent {
  pub id: String,
  pub format: ExportFormat,
  pub output_path: String,
  pub status: ExportTaskStatus,
  pub progress: Option<f64>,
  pub message: String,
}
pub use ExportCancelRequest as CancelRequest;

#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExportCancelRequest {
  pub task_id: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ExportTaskStatus {
  Started,
  Finished,
  Failed,
  Cancelled,
}
impl ExportTaskStatus {
  pub fn as_str(self) -> &'static str {
    match self {
      Self::Started => "started",
      Self::Finished => "finished",
      Self::Failed => "failed",
      Self::Cancelled => "cancelled",
    }
  }
}
