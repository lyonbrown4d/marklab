use super::*;
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
    error::{BackendError, BackendResult},
    workspace::WorkspaceRegistry,
};
use tauri::{Emitter, Manager, State};
#[tauri::command]
pub async fn webdav_profile_list(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: EmptyRequest,
) -> BackendResult<Vec<Profile>> {
    let _ = request;
    registry.get(window.label())?;
    service.list_profiles().await
}
#[tauri::command]
pub async fn webdav_profile_update(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: ProfileInput,
) -> BackendResult<Profile> {
    registry.get(window.label())?;
    service.update_profile(request).await
}
#[tauri::command]
pub async fn webdav_profile_delete(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: IdRequest,
) -> BackendResult<OkResult> {
    registry.get(window.label())?;
    service.delete_profile(&request.id).await?;
    Ok(OkResult { ok: true })
}
#[tauri::command]
pub async fn webdav_profile_test(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: IdRequest,
) -> BackendResult<OkResult> {
    registry.get(window.label())?;
    service.test_profile(&request.id).await?;
    Ok(OkResult { ok: true })
}
#[tauri::command]
pub async fn sync_channels_get(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: EmptyRequest,
) -> BackendResult<Channels> {
    let _ = request;
    let workspace = registry.get(window.label())?;
    Ok(Channels {
        webdav: service.channel(&workspace.root_info()).await?,
    })
}
#[tauri::command]
pub async fn sync_channels_set(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: Channel,
) -> BackendResult<Channels> {
    service
        .set_channel(&registry.get(window.label())?.root_info(), request)
        .await
}
#[tauri::command]
pub async fn sync_channels_remove(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: EmptyRequest,
) -> BackendResult<Channels> {
    let _ = request;
    service
        .remove_channel(&registry.get(window.label())?.root_info())
        .await
}
#[tauri::command]
pub async fn sync_start(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: RequestId,
) -> BackendResult<SyncOutcome> {
    uuid::Uuid::parse_str(&request.request_id)
        .map_err(|_| paths::invalid("Invalid sync request ID"))?;
    let workspace = registry.get(window.label())?;
    let root = SyncService::workspace_key(&workspace.root_info())?;
    let Some(cancel) = service
        .begin_run(&root, window.label(), &request.request_id)
        .await
    else {
        return Ok(SyncOutcome::Busy);
    };
    let before_revision = workspace.current_revision();
    let outcome = {
        let _configuration = service.inner.configuration.read().await;
        let on_progress = |progress: SyncProgress| {
            let _ = window.emit(
                "sync-progress",
                serde_json::json!({"requestId":request.request_id,"progress":progress}),
            );
        };
        engine::synchronize(
            &service,
            &workspace,
            &on_progress,
            cancel,
            Some((registry.inner(), window.label())),
        )
        .await
    };
    announce_changes(&window, &workspace, before_revision).await;
    service.finish_run(&root, &request.request_id).await;
    Ok(match outcome {
        Ok(result) => SyncOutcome::Completed { result },
        Err(error)
            if error.code == "ABORTED"
                || error.code == "SYNC_CANCELLED"
                || error.code == "aborted" =>
        {
            SyncOutcome::Cancelled
        }
        Err(error) => SyncOutcome::Failed {
            message: error.message,
        },
    })
}
#[tauri::command]
pub async fn sync_cancel(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: RequestId,
) -> BackendResult<CancelResult> {
    registry.get(window.label())?;
    uuid::Uuid::parse_str(&request.request_id)
        .map_err(|_| paths::invalid("Invalid sync request ID"))?;
    let runs = service.inner.runs.lock().await;
    let mut cancelled = false;
    for run in runs.values() {
        if run.owner == window.label() && run.request_id == request.request_id {
            let _ = run.cancel.send(true);
            cancelled = true;
        }
    }
    Ok(CancelResult {
        ok: true,
        cancelled,
    })
}
#[tauri::command]
pub async fn sync_conflicts_list(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: RootRequest,
) -> BackendResult<ConflictList> {
    let workspace = registry.get(window.label())?;
    let _configuration = service.inner.configuration.read().await;
    conflicts::list(&service, &workspace, &request.root_path).await
}
#[tauri::command]
pub async fn sync_conflicts_read(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: ConflictRequest,
) -> BackendResult<ConflictComparison> {
    let workspace = registry.get(window.label())?;
    let root = SyncService::workspace_key(&workspace.root_info())?;
    let id = uuid::Uuid::new_v4().to_string();
    let cancel = service
        .begin_run(&root, window.label(), &id)
        .await
        .ok_or_else(|| BackendError::new("SYNC_BUSY", "Workspace sync is busy"))?;
    let before_revision = workspace.current_revision();
    let result = {
        let _configuration = service.inner.configuration.read().await;
        conflicts::read(
            &service,
            &workspace,
            request,
            cancel,
            Some((registry.inner(), window.label())),
        )
        .await
    };
    announce_changes(&window, &workspace, before_revision).await;
    service.finish_run(&root, &id).await;
    result
}
#[tauri::command]
pub async fn sync_conflicts_resolve(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, SyncService>,
    request: ResolutionRequest,
) -> BackendResult<ResolutionResult> {
    let workspace = registry.get(window.label())?;
    let root = SyncService::workspace_key(&workspace.root_info())?;
    let id = uuid::Uuid::new_v4().to_string();
    let cancel = service
        .begin_run(&root, window.label(), &id)
        .await
        .ok_or_else(|| BackendError::new("SYNC_BUSY", "Workspace sync is busy"))?;
    let before_revision = workspace.current_revision();
    let result = {
        let _configuration = service.inner.configuration.read().await;
        conflicts::resolve(
            &service,
            &workspace,
            request,
            cancel,
            Some((registry.inner(), window.label())),
        )
        .await
    };
    announce_changes(&window, &workspace, before_revision).await;
    service.finish_run(&root, &id).await;
    result
}
impl SyncService {
    async fn begin_run(
        &self,
        root: &str,
        owner: &str,
        request_id: &str,
    ) -> Option<watch::Receiver<bool>> {
        let mut runs = self.inner.runs.lock().await;
        if runs.contains_key(root) {
            return None;
        }
        let (cancel, receiver) = watch::channel(false);
        runs.insert(
            root.into(),
            Run {
                owner: owner.into(),
                request_id: request_id.into(),
                cancel,
            },
        );
        Some(receiver)
    }
    async fn finish_run(&self, root: &str, request_id: &str) {
        let mut runs = self.inner.runs.lock().await;
        if runs
            .get(root)
            .is_some_and(|run| run.request_id == request_id)
        {
            runs.remove(root);
        }
    }
}

async fn announce_changes(
    window: &WebviewWindow,
    workspace: &crate::workspace::Workspace,
    previous: u64,
) {
    let revision = workspace.current_revision();
    if revision == previous || workspace.ensure_active().is_err() {
        return;
    }
    let payload = serde_json::json!({"kind":"invalidated","root":workspace.root_info(),"generation":workspace.generation,"previousRevision":previous,"revision":revision});
    let _ = workspace.emit(window.app_handle(), "fs-changed", &payload);
    let _ = workspace.emit(window.app_handle(), "workspace-tree-changed", serde_json::json!({"kind":"invalidated","root":workspace.root_info(),"generation":workspace.generation,"previousRevision":previous,"revision":revision}));
}
