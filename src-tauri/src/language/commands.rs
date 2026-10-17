use super::{LanguageService, completion, markdown, mermaid, rename, types::*};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
    analysis::AnalysisService,
    error::{BackendError, BackendResult},
    workspace::WorkspaceRegistry,
};
use serde_json::{Value, json};
use tauri::{Emitter, State};

#[tauri::command]
pub async fn language_document_open(
    window: WebviewWindow,
    language: State<'_, LanguageService>,
    request: OpenRequest,
) -> BackendResult<DocumentAck> {
    language.open(window.label().into(), request).await
}
#[tauri::command]
pub async fn language_document_change(
    window: WebviewWindow,
    language: State<'_, LanguageService>,
    request: ChangeRequest,
) -> BackendResult<DocumentAck> {
    language.change(window.label().into(), request).await
}
#[tauri::command]
pub async fn language_document_close(
    window: WebviewWindow,
    language: State<'_, LanguageService>,
    request: CloseRequest,
) -> BackendResult<Value> {
    language.close(window.label().into(), request).await?;
    Ok(json!({"ok":true}))
}

#[tauri::command]
pub async fn language_completion(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: CompletionRequest,
) -> BackendResult<Value> {
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
pub async fn language_diagnostics(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: DiagnosticsRequest,
) -> BackendResult<Value> {
    let document = language
        .snapshot(window.label().into(), request.uri, request.version)
        .await?;
    if document.language_id == "mermaid" {
        return language
            .run(move || Ok(mermaid::diagnostics(&document.text, 0)))
            .await;
    }
    let index = analysis.index(registry.get(window.label())?).await?;
    language
        .run(move || {
            if document.text.len() > 2 * 1024 * 1024 {
                return Ok(json!([]));
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
                .and_then(|value| value.as_array().cloned())
                .unwrap_or_default();
            for block in mermaid::blocks(&document.text) {
                if let Some(items) = mermaid::diagnostics(&block.text, block.start_line).as_array()
                {
                    diagnostics.extend(items.iter().cloned());
                }
            }
            Ok(json!(diagnostics))
        })
        .await
}

#[tauri::command]
pub async fn markdown_language_get_document_symbols(
    language: State<'_, LanguageService>,
    request: MarkdownRequest,
) -> BackendResult<Value> {
    validate(&request)?;
    language.run(move || markdown::symbols(&request)).await
}
#[tauri::command]
pub async fn markdown_language_get_definition(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: MarkdownRequest,
) -> BackendResult<Value> {
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
pub async fn markdown_language_get_references(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: MarkdownRequest,
) -> BackendResult<Value> {
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
pub async fn markdown_language_get_code_actions(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: MarkdownRequest,
) -> BackendResult<Value> {
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
pub async fn markdown_language_get_hover(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: MarkdownRequest,
) -> BackendResult<Value> {
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
pub async fn markdown_language_rename_references(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    analysis: State<'_, AnalysisService>,
    language: State<'_, LanguageService>,
    request: MarkdownRequest,
) -> BackendResult<Value> {
    validate(&request)?;
    let workspace = registry.get(window.label())?;
    let index = analysis.index(workspace.clone()).await?;
    let plan = language
        .run(move || {
            let index = markdown::overlay(&index, &request)?;
            rename::prepare(&index, &request)
        })
        .await?;
    let _mutation = workspace.mutation.lock().await;
    for edit in &plan.external {
        if workspace.open_file_under_lock(&edit.path).await? != edit.before {
            return Err(BackendError::new(
                "EDIT_CONFLICT",
                "A referenced document changed while preparing the rename",
            ));
        }
    }
    for edit in plan.external {
        workspace
            .write_file_under_lock(&edit.path, &edit.after)
            .await?;
        if let Some(status) = workspace.buffer_status(&edit.path).await? {
            window.emit("fs-buffer-status", status)?;
        }
    }
    Ok(plan.result)
}

async fn query(
    window: WebviewWindow,
    registry: &WorkspaceRegistry,
    analysis: &AnalysisService,
    language: &LanguageService,
    request: MarkdownRequest,
    operation: fn(&crate::analysis::Index, &MarkdownRequest) -> Value,
) -> BackendResult<Value> {
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
