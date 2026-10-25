pub use marklab_document::types::{ExportFormat, PublicationOptions, SourceDocument};
use serde::{Deserialize, Serialize};

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
