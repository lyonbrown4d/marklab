use super::{MAX_SOURCE_BYTES, RenderedDiagram};
use crate::error::{BackendError, BackendResult};
use std::panic::{AssertUnwindSafe, catch_unwind};

pub fn validate(source: &str) -> BackendResult<()> {
  if source.trim().is_empty() || source.len() > MAX_SOURCE_BYTES {
    return Err(BackendError::new(
      "INVALID_PLANTUML",
      "PlantUML source must contain between 1 and 131072 bytes",
    ));
  }
  if source.lines().count() > 4000 {
    return Err(BackendError::new(
      "INVALID_PLANTUML",
      "PlantUML preview is limited to 4000 lines",
    ));
  }
  Ok(())
}

pub fn render(source: &str) -> BackendResult<RenderedDiagram> {
  validate(source)?;
  // Do not grant a local include root. URL includes are disabled by Cargo.
  let artifacts = catch_unwind(AssertUnwindSafe(|| {
    puml::render_source_to_artifacts(source)
  }))
  .map_err(|_| BackendError::new("PLANTUML_RENDER_FAILED", "PlantUML rendering failed"))?
  .map_err(|error| diagnostic_error(&error, source))?;
  if artifacts.is_empty() || artifacts.len() > 16 {
    return Err(BackendError::new(
      "PLANTUML_TOO_LARGE",
      "PlantUML preview supports up to 16 pages",
    ));
  }
  let total = artifacts.iter().map(|page| page.svg.len()).sum::<usize>();
  if total > 2 * 1024 * 1024 {
    return Err(BackendError::new(
      "PLANTUML_TOO_LARGE",
      "PlantUML preview exceeds 2 MiB",
    ));
  }
  let mut warnings = Vec::new();
  let mut pages = Vec::with_capacity(artifacts.len());
  for artifact in artifacts {
    for diagnostic in &artifact.diagnostics {
      if diagnostic.severity == puml::diagnostic::Severity::Error {
        return Err(diagnostic_error(diagnostic, source));
      }
      let message = diagnostic
        .render_with_source(source)
        .chars()
        .take(1024)
        .collect::<String>();
      if warnings.len() < 20 && !warnings.contains(&message) {
        warnings.push(message);
      }
    }
    pages.push(artifact.svg);
  }
  Ok(RenderedDiagram { pages, warnings })
}

fn diagnostic_error(diagnostic: &puml::Diagnostic, source: &str) -> BackendError {
  BackendError::new(
    "INVALID_PLANTUML",
    diagnostic
      .render_with_source(source)
      .chars()
      .take(2048)
      .collect::<String>(),
  )
}
