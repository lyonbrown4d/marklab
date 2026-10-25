pub mod analysis;
pub mod assets;
mod docx;
mod docx_inline;
mod epub;
pub mod error;
mod html;
pub mod markdown;
mod pdf;
mod txt;
pub mod types;
mod typst_engine;

use error::{BackendError, BackendResult};
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
    ExportFormat::Txt => txt::render(documents, options, cancelled),
    ExportFormat::Epub => epub::render(documents, options, cancelled),
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
