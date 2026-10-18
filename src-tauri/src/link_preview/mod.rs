mod cache;
mod capture;
mod disk_cache;
mod metadata;
mod network;
mod sanitize;
use crate::{
    error::BackendResult, native_window::TrustedWindow as WebviewWindow,
    workspace::WorkspaceRegistry,
};
use serde::{Deserialize, Serialize};
use tauri::{Manager, State};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub url: String,
}
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum PreviewResult {
    Webpage {
        url: String,
        canonical: Option<String>,
        description: Option<String>,
        favicon: Option<String>,
        image: Option<String>,
        site_name: Option<String>,
        title: Option<String>,
    },
    Image {
        url: String,
        media_type: String,
        src: String,
    },
}
#[derive(Clone, Serialize)]
pub struct Capture {
    pub height: u32,
    pub width: u32,
    pub src: String,
    pub url: String,
}
#[derive(Clone)]
pub struct LinkPreviewService {
    inner: std::sync::Arc<cache::Inner>,
}
#[tauri::command]
pub async fn link_preview_fetch(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, LinkPreviewService>,
    request: Request,
) -> BackendResult<PreviewResult> {
    let workspace = registry.get(window.label())?;
    workspace.ensure_active()?;
    let result = service
        .fetch(&window, request.url, workspace.generation)
        .await?;
    workspace.ensure_active()?;
    if registry.get(window.label())?.generation != workspace.generation {
        return Err(network::failure(
            "Workspace changed before preview completed",
        ));
    }
    Ok(result)
}
#[tauri::command]
pub async fn link_preview_capture(
    window: WebviewWindow,
    registry: State<'_, WorkspaceRegistry>,
    service: State<'_, LinkPreviewService>,
    request: Request,
) -> BackendResult<Capture> {
    let workspace = registry.get(window.label())?;
    workspace.ensure_active()?;
    let result = service
        .capture(&window, request.url, workspace.generation)
        .await?;
    workspace.ensure_active()?;
    if registry.get(window.label())?.generation != workspace.generation {
        return Err(network::failure(
            "Workspace changed before preview completed",
        ));
    }
    Ok(result)
}

fn ensure_generation(app: &tauri::AppHandle, owner: &str, generation: u64) -> BackendResult<()> {
    let workspace = app.state::<WorkspaceRegistry>().get(owner)?;
    if workspace.generation != generation {
        return Err(network::failure(
            "Workspace changed before preview completed",
        ));
    }
    workspace.ensure_active()
}
