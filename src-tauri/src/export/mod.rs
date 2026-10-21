mod assets;
pub mod commands;
mod docx;
mod docx_inline;
mod html;
pub mod markdown;
mod pdf;
mod service;
pub mod types;
mod typst_engine;

use crate::error::{BackendError, BackendResult};
pub use service::ExportService;
use tokio_util::sync::CancellationToken;
pub use types::{ExportFormat, PublicationOptions, SourceDocument};

pub fn check_cancelled(cancelled: &CancellationToken) -> BackendResult<()> {
  if cancelled.is_cancelled() {
    Err(BackendError::new("EXPORT_CANCELLED", "Export cancelled"))
  } else {
    Ok(())
  }
}

pub fn render(
  format: ExportFormat,
  documents: &[SourceDocument],
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<u8>> {
  options.validate()?;
  check_cancelled(cancelled)?;
  match format {
    ExportFormat::Pdf => pdf::render(documents, options, cancelled),
    ExportFormat::Docx => docx::render(documents, options, cancelled),
    ExportFormat::Html => html::render(documents, options, cancelled),
    ExportFormat::Markdown => Ok(
      documents
        .iter()
        .map(|document| document.markdown.as_str())
        .collect::<Vec<_>>()
        .join("\n\n")
        .into_bytes(),
    ),
  }
}

#[cfg(test)]
mod tests;
