use crate::{
    error::BackendResult,
    workspace::{Workspace, WorkspaceRegistry},
};
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
fn trusted_navigation(url: &url::Url) -> bool {
    let page = url.path().trim_start_matches('/');
    let page_ok = ["", "index.html", "window-opening.html", "splashscreen.html"].contains(&page);
    let local = (url.scheme() == "tauri" && url.host_str() == Some("localhost"))
        || (["http", "https"].contains(&url.scheme())
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none());
    let development = cfg!(debug_assertions)
        && url.scheme() == "http"
        && url.host_str() == Some("localhost")
        && url.port() == Some(5173);
    page_ok && url.username().is_empty() && url.password().is_none() && (local || development)
}
pub fn create_splash(app: &AppHandle) -> BackendResult<()> {
    let window =
        WebviewWindowBuilder::new(app, "splash", WebviewUrl::App("splashscreen.html".into()))
            .title("Marklab")
            .inner_size(344.0, 196.0)
            .resizable(false)
            .decorations(false)
            .center()
            .visible(false)
            .focused(false)
            .skip_taskbar(true)
            .on_navigation(trusted_navigation)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_page_load(|window, payload| {
                if payload.event() == tauri::webview::PageLoadEvent::Finished {
                    let _ = window.show();
                }
            })
            .build()?;
    crate::native_window::register(&window)?;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        if let Some(window) = crate::native_window::get(&handle, "splash") {
            let _ = window.show();
        }
    });
    Ok(())
}
pub fn ensure_opening(app: &AppHandle, label: &str) -> BackendResult<WebviewWindow> {
    let opening = format!("opening-{label}");
    if let Some(window) = crate::native_window::get(app, &opening) {
        window.show()?;
        return Ok(window.as_ref().clone());
    }
    let window =
        WebviewWindowBuilder::new(app, &opening, WebviewUrl::App("window-opening.html".into()))
            .title("Marklab")
            .inner_size(580.0, 320.0)
            .min_inner_size(480.0, 280.0)
            .resizable(false)
            .center()
            .focused(false)
            .visible(true)
            .on_navigation(trusted_navigation)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .build()?;
    crate::native_window::register(&window)?;
    Ok(window)
}
pub async fn create(
    app: &AppHandle,
    label: &str,
    title: Option<&str>,
) -> BackendResult<WebviewWindow> {
    let state = super::geometry::restore(app, label).await?;
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(title.unwrap_or("Marklab"))
        .inner_size(state.width.max(640) as f64, state.height.max(480) as f64)
        .min_inner_size(640.0, 480.0)
        .visible(false)
        .decorations(cfg!(target_os = "macos"))
        .on_navigation(trusted_navigation)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .hidden_title(true)
            .traffic_light_position(tauri::LogicalPosition::new(16.0, 16.0));
    }
    let window = builder.build()?;
    crate::native_window::register(&window)?;
    if let (Some(x), Some(y)) = (state.x, state.y) {
        let displays = window
            .available_monitors()?
            .into_iter()
            .map(|monitor| {
                let area = *monitor.work_area();
                (
                    area.position.x,
                    area.position.y,
                    area.size.width,
                    area.size.height,
                )
            })
            .collect::<Vec<_>>();
        if super::policy::visible_rectangle(x, y, state.width, state.height, &displays) {
            window.set_position(tauri::PhysicalPosition::new(x, y))?;
        } else {
            window.center()?;
        }
    }
    let attempt = match app.state::<super::startup::StartupState>().boot(label)? {
        Some(boot) => boot.attempt,
        None => app
            .state::<super::startup::StartupState>()
            .begin(label, None)?,
    };
    if label != "main" || crate::native_window::get(app, "splash").is_none() {
        ensure_opening(app, label)?;
    }
    super::startup::schedule_timeout(app, label, attempt);
    Ok(window)
}
pub async fn bind(
    app: &AppHandle,
    label: &str,
    path: Option<&str>,
    single: bool,
) -> BackendResult<Arc<Workspace>> {
    let workspace = bind_root(app, label, path, single).await?;
    app.state::<WorkspaceRegistry>()
        .start_watcher(label, app.clone())
        .await?;
    Ok(workspace)
}
pub(super) async fn bind_root(
    app: &AppHandle,
    label: &str,
    path: Option<&str>,
    single: bool,
) -> BackendResult<Arc<Workspace>> {
    app.state::<WorkspaceRegistry>()
        .open_async(label, path, single)
        .await
}
pub use super::transitions::{open_target, restore_window};
pub async fn open_targets(args: &[String]) -> Vec<String> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("/"));
    existing_targets(args, &cwd).await
}
pub async fn existing_targets(args: &[String], cwd: &Path) -> Vec<String> {
    let mut targets = Vec::new();
    for path in super::policy::argument_targets(args, cwd) {
        if targets.contains(&path) {
            continue;
        }
        if tokio::fs::metadata(&path)
            .await
            .is_ok_and(|metadata| metadata.is_file() || metadata.is_dir())
        {
            targets.push(path);
        }
    }
    targets
}

pub async fn activate_workspace_geometry(
    window: &WebviewWindow,
    root: &crate::workspace::RootInfo,
) -> BackendResult<()> {
    super::geometry::activate(window, root).await
}
pub fn activate_existing(app: &AppHandle) -> BackendResult<bool> {
    let window = super::menus::focused(app).or_else(|| {
        app.webview_windows()
            .keys()
            .filter(|label| label.starts_with("opening-"))
            .find_map(|label| crate::native_window::get(app, label))
    });
    let Some(window) = window else {
        return Ok(false);
    };
    window.unminimize()?;
    window.show()?;
    window.set_focus()?;
    Ok(true)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_never_transfers_trusted_ipc_to_remote_content() {
        assert!(!trusted_navigation(
            &url::Url::parse("https://example.com/index.html").unwrap()
        ));
        assert!(!trusted_navigation(
            &url::Url::parse("tauri://localhost/remote.html").unwrap()
        ));
        assert!(trusted_navigation(
            &url::Url::parse("tauri://localhost/index.html").unwrap()
        ));
    }
}
