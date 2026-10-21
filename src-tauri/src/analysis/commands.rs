use super::projections::Projection;
use super::{AnalysisService, graph, queries, search, status};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  error::BackendResult,
  workspace::{EmptyRequest, WorkspaceRegistry},
};
use tauri::State;

#[tauri::command]
#[specta::specta]
pub async fn fs_query_workspace_pages(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: queries::PageRequest,
) -> BackendResult<std::sync::Arc<queries::PageResult>> {
  project(
    &window,
    &registry,
    &analysis,
    "pages",
    request,
    queries::pages,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_query_workspace_navigation(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: queries::NavigationRequest,
) -> BackendResult<std::sync::Arc<queries::NavigationResult>> {
  project(
    &window,
    &registry,
    &analysis,
    "navigation",
    request,
    queries::navigation,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_get_workspace_document_insights(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: queries::InsightsRequest,
) -> BackendResult<std::sync::Arc<queries::InsightsResult>> {
  project(
    &window,
    &registry,
    &analysis,
    "insights",
    request,
    queries::insights,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_get_workspace_knowledge_summary(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<std::sync::Arc<queries::KnowledgeSummary>> {
  let _ = request;
  project(&window, &registry, &analysis, "summary", (), |index, ()| {
    Ok(queries::summary(index))
  })
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_get_workspace_graph(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<std::sync::Arc<graph::WorkspaceGraph>> {
  let _ = request;
  project(&window, &registry, &analysis, "graph", (), |index, ()| {
    Ok(graph::graph(index))
  })
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_get_workspace_graph_node_details(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: graph::DetailsRequest,
) -> BackendResult<std::sync::Arc<graph::GraphDetails>> {
  project(
    &window,
    &registry,
    &analysis,
    "details",
    request,
    graph::details,
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_get_workspace_publication_plan(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<std::sync::Arc<graph::PublicationPlan>> {
  let _ = request;
  project(
    &window,
    &registry,
    &analysis,
    "publication",
    (),
    |index, ()| Ok(graph::publication(index)),
  )
  .await
}
#[tauri::command]
#[specta::specta]
pub async fn fs_search_workspace(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: search::SearchRequest,
) -> BackendResult<Vec<search::SearchResult>> {
  let workspace = registry.get(window.label())?;
  let revision = workspace.current_revision();
  let result = analysis.search(workspace.clone(), request).await?;
  registry.ensure_binding(window.label(), &workspace)?;
  if workspace.current_revision() != revision {
    return Err(super::service::changed());
  }
  Ok(result)
}
#[tauri::command]
#[specta::specta]
pub async fn fs_search_workspace_occurrences(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: search::OccurrenceRequest,
) -> BackendResult<search::OccurrenceResult> {
  let workspace = registry.get(window.label())?;
  let revision = workspace.current_revision();
  let result = analysis
    .occurrences(window.label(), workspace.clone(), request)
    .await?;
  registry.ensure_binding(window.label(), &workspace)?;
  if workspace.current_revision() != revision {
    return Err(super::service::changed());
  }
  Ok(result)
}
#[tauri::command]
#[specta::specta]
pub async fn fs_cancel_workspace_occurrence_search(
  window: WebviewWindow,
  analysis: State<'_, AnalysisService>,
  request: search::CancelRequest,
) -> BackendResult<status::OccurrenceCancellation> {
  Ok(status::OccurrenceCancellation {
    cancelled: analysis
      .cancel_occurrence(window.label(), &request.request_id)
      .await,
    request_id: request.request_id,
  })
}
#[tauri::command]
#[specta::specta]
pub async fn fs_rebuild_search_index(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<()> {
  let _ = request;
  let workspace = registry.get(window.label())?;
  analysis.invalidate(workspace.generation).await;
  analysis.index(workspace).await?;
  Ok(())
}
#[tauri::command]
#[specta::specta]
pub async fn knowledge_engine_status(
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<status::EngineStatus> {
  let _ = request;
  Ok(analysis.status().await)
}
#[tauri::command]
#[specta::specta]
pub async fn knowledge_engine_initialize(
  window: WebviewWindow,
  registry: State<'_, WorkspaceRegistry>,
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<status::EngineInitialization> {
  let _ = request;
  analysis.index(registry.get(window.label())?).await?;
  Ok(status::EngineInitialization {
    ok: true,
    response: status::EmbeddedMode {
      mode: status::EngineMode::RustEmbedded,
    },
    status: analysis.status().await,
  })
}
#[tauri::command]
#[specta::specta]
pub async fn knowledge_engine_stop(
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<status::EngineStatus> {
  let _ = request;
  analysis.stop().await?;
  Ok(analysis.status().await)
}
#[tauri::command]
#[specta::specta]
pub async fn knowledge_engine_workspace_status(
  analysis: State<'_, AnalysisService>,
  request: status::WorkspaceStatusRequest,
) -> BackendResult<status::EngineWorkspaceStatus> {
  analysis.workspace_status(&request.workspace_id).await
}
#[tauri::command]
#[specta::specta]
pub async fn knowledge_engine_workspaces(
  analysis: State<'_, AnalysisService>,
  request: EmptyRequest,
) -> BackendResult<Vec<status::EngineWorkspace>> {
  let _ = request;
  Ok(analysis.workspaces().await)
}

async fn project<R: serde::Serialize + Send + 'static, T: Projection>(
  window: &WebviewWindow,
  registry: &WorkspaceRegistry,
  analysis: &AnalysisService,
  kind: &'static str,
  request: R,
  task: impl FnOnce(&super::Index, R) -> BackendResult<T> + Send + 'static,
) -> BackendResult<std::sync::Arc<T>> {
  let workspace = registry.get(window.label())?;
  let index = analysis.index(workspace.clone()).await?;
  let revision = index.revision;
  let result = analysis.project_cached(index, kind, request, task).await?;
  registry.ensure_binding(window.label(), &workspace)?;
  if workspace.current_revision() != revision {
    return Err(super::service::changed());
  }
  Ok(result)
}
