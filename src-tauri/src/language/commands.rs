use super::{LanguageService, completion, markdown, mermaid, rename, types::*};
use super::{
  markdown_types::*,
  protocol::{CompletionResponse, DiagnosticsResponse},
};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  analysis::AnalysisService,
  error::{BackendError, BackendResult},
  workspace::WorkspaceRegistry,
};
use tauri::{Manager, State};

#[tauri::command]
#[specta::specta]
pub async fn language_document_open(
  window: WebviewWindow,
  language: State<'_, LanguageService>,
  request: OpenRequest,
) -> BackendResult<DocumentAck> {
  language.open(window.label().into(), request).await
}
#[tauri::command]
#[specta::specta]
pub async fn language_document_change(
  window: WebviewWindow,
  language: State<'_, LanguageService>,
  request: ChangeRequest,
) -> BackendResult<DocumentAck> {
  language.change(window.label().into(), request).await
}
#[tauri::command]
#[specta::specta]
pub async fn language_document_close(
  window: WebviewWindow,
  language: State<'_, LanguageService>,
  request: CloseRequest,
) -> BackendResult<CloseAck> {
  language.close(window.label().into(), request).await?;
  Ok(CloseAck { ok: true })
}

#[tauri::command]
#[specta::specta]
pub async fn language_completion(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: CompletionRequest,
) -> BackendResult<CompletionResponse> {
  let document = language
    .snapshot(window.label().into(), request.uri, request.version)
    .await?;
  let index = analysis.index(registry.get(window.label())?).await?;
  language
    .run(move || {
      let request = MarkdownRequest {
        path: document.path.clone(),
        content: document.text.to_string(),
        line: request.position.line + 1,
        column: request.position.character + 1,
        new_name: None,
      };
      let index = markdown::overlay(&index, &request)?;
      completion::completion(&index, &document, request_position(&request))
    })
    .await
}
#[tauri::command]
#[specta::specta]
pub async fn language_diagnostics(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: DiagnosticsRequest,
) -> BackendResult<DiagnosticsResponse> {
  let document = language
    .snapshot(window.label().into(), request.uri, request.version)
    .await?;
  if document.language_id == "mermaid" {
    return language
      .run(move || Ok(DiagnosticsResponse(mermaid::diagnostics(&document.text, 0))))
      .await;
  }
  let index = analysis.index(registry.get(window.label())?).await?;
  language
    .run(move || {
      if document.text.len() > 2 * 1024 * 1024 {
        return Ok(DiagnosticsResponse(Vec::new()));
      }
      let request = MarkdownRequest {
        path: document.path.clone(),
        content: document.text.to_string(),
        line: 1,
        column: 1,
        new_name: None,
      };
      let index = markdown::overlay(&index, &request)?;
      let mut diagnostics = document
        .path
        .as_ref()
        .and_then(|path| index.files.get(path))
        .map(|file| markdown::diagnostics(&index, file))
        .unwrap_or_default();
      for block in mermaid::blocks(&document.text) {
        diagnostics.extend(mermaid::diagnostics(&block.text, block.start_line));
      }
      Ok(DiagnosticsResponse(diagnostics))
    })
    .await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_language_get_document_symbols(
  language: State<'_, LanguageService>,
  request: MarkdownRequest,
) -> BackendResult<Vec<MarkdownSymbol>> {
  validate(&request)?;
  language.run(move || markdown::symbols(&request)).await
}
#[tauri::command]
#[specta::specta]
pub async fn markdown_language_get_definition(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: MarkdownRequest,
) -> BackendResult<Option<MarkdownDefinition>> {
  query(
    window,
    &registry,
    &analysis,
    &language,
    request,
    markdown::definition,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn markdown_language_get_references(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: MarkdownRequest,
) -> BackendResult<Vec<MarkdownReference>> {
  query(
    window,
    &registry,
    &analysis,
    &language,
    request,
    markdown::references,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn markdown_language_get_code_actions(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: MarkdownRequest,
) -> BackendResult<Vec<MarkdownCodeAction>> {
  query(
    window,
    &registry,
    &analysis,
    &language,
    request,
    markdown::code_actions,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn markdown_language_get_hover(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: MarkdownRequest,
) -> BackendResult<Option<MarkdownHover>> {
  query(
    window,
    &registry,
    &analysis,
    &language,
    request,
    markdown::hover,
  )
  .await
}

#[tauri::command]
#[specta::specta]
pub async fn markdown_language_rename_references(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  language: State<'_, LanguageService>,
  request: MarkdownRequest,
) -> BackendResult<RenameResult> {
  validate(&request)?;
  let workspace = registry.get(window.label())?;
  let index = analysis.index(workspace.clone()).await?;
  let plan = language
    .run(move || {
      let index = markdown::overlay(&index, &request)?;
      rename::prepare(&index, &request)
    })
    .await?;
  let _mutation = registry.lock_binding(window.label(), &workspace).await?;
  rename::validate_source(&workspace, plan.source.as_ref()).await?;
  rename::validate_external(&workspace, &plan.external).await?;
  let changed = !plan.external.is_empty();
  for status in rename::apply_external(&workspace, plan.external).await? {
    workspace.emit_to_owners(
      window.app_handle(),
      crate::desktop::event_contracts::FS_BUFFER_STATUS,
      status,
    )?;
  }
  if changed {
    workspace.clone().schedule_save(window.app_handle().clone());
    workspace.invalidate(window.app_handle())?;
  }
  Ok(plan.result)
}

async fn query<T: Send + 'static>(
  window: WebviewWindow,
  registry: &WorkspaceRegistry,
  analysis: &AnalysisService,
  language: &LanguageService,
  request: MarkdownRequest,
  operation: fn(&crate::analysis::Index, &MarkdownRequest) -> T,
) -> BackendResult<T> {
  validate(&request)?;
  let index = analysis.index(registry.get(window.label())?).await?;
  language
    .run(move || {
      let index = markdown::overlay(&index, &request)?;
      Ok(operation(&index, &request))
    })
    .await
}
fn request_position(request: &MarkdownRequest) -> Position {
  Position {
    line: request.line - 1,
    character: request.column - 1,
  }
}
fn validate(request: &MarkdownRequest) -> BackendResult<()> {
  if request.line == 0 || request.column == 0 || request.content.len() > 64 * 1024 * 1024 {
    return Err(BackendError::new(
      "INVALID_REQUEST",
      "Invalid bounded Markdown language request",
    ));
  }
  Ok(())
}
