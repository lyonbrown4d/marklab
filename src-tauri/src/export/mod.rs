mod assets;
pub mod commands;
mod service;
pub mod types;

use crate::error::BackendResult;
pub use marklab_document::markdown;
pub use service::ExportService;
use tokio_util::sync::CancellationToken;
pub use types::{ExportFormat, PublicationOptions, SourceDocument};

pub fn check_cancelled(cancelled: &CancellationToken) -> BackendResult<()> {
  marklab_document::check_cancelled(cancelled).map_err(Into::into)
}

pub fn render(
  format: ExportFormat,
  documents: &[SourceDocument],
  options: &PublicationOptions,
  cancelled: &CancellationToken,
) -> BackendResult<Vec<u8>> {
  marklab_document::render(format, documents, options, cancelled).map_err(Into::into)
}

#[cfg(test)]
mod tests;
