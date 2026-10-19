use crate::{
    error::BackendResult,
    workspace::{Workspace, WorkspaceRegistry},
};
use std::sync::Arc;
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
fn workspace_navigation(url: &url::Url) -> bool {
    // WKWebView and WebKitGTK report iframe navigations through this same
    // URL-only callback. Drawio accepts user-configured HTTPS embeds. The
    // sandbox denies top navigation; Tauri's origin ACL and TrustedWindow
    // independently deny native commands to every remote document.
    trusted_navigation(url)
        || (url.scheme() == "https"
            && url.has_host()
            && url.username().is_empty()
            && url.password().is_none())
}
pub fn create_splash(app: &AppHandle) -> BackendResult<()> {
    create_loading(app, "splash", "splashscreen.html")?;
    Ok(())
}
fn create_loading(app: &AppHandle, label: &str, page: &str) -> BackendResult<WebviewWindow> {
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(page.into()))
        .title("Marklab")
        .inner_size(344.0, 196.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .no_redirection_bitmap(true)
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
    let fallback = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(700)).await;
        let _ = fallback.show();
    });
    Ok(window)
}
pub fn ensure_opening(app: &AppHandle, label: &str) -> BackendResult<WebviewWindow> {
    let opening = format!("opening-{label}");
    if let Some(window) = crate::native_window::get(app, &opening) {
        window.show()?;
        return Ok(window.as_ref().clone());
    }
    create_loading(app, &opening, "window-opening.html")
}
pub async fn create(
    app: &AppHandle,
    label: &str,
    title: Option<&str>,
) -> BackendResult<WebviewWindow> {
    let state = super::geometry::restore(app, label).await?;
    #[cfg(not(target_os = "macos"))]
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()));
    #[cfg(target_os = "macos")]
    let builder = WebviewWindowBuilder::from_config(
        app,
        &tauri::utils::config::WindowConfig {
            label: label.into(),
            url: WebviewUrl::App("index.html".into()),
            // The 52px header has 51px of content above its bottom border.
            // Measured AppKit button height 14pt and local center 16pt give
            // Wry inset 25.5 + 16 - 14 = 27.5pt. Seed both Tao and Wry.
            traffic_light_position: Some(tauri::utils::config::LogicalPosition {
                x: 16.0,
                y: 27.5,
            }),
            ..Default::default()
        },
    )?
    .title_bar_style(tauri::TitleBarStyle::Overlay)
    .hidden_title(true);
    let builder = builder
        .title(title.unwrap_or("Marklab"))
        .inner_size(state.width.max(640) as f64, state.height.max(480) as f64)
        .min_inner_size(640.0, 480.0)
        .visible(false)
        .decorations(cfg!(target_os = "macos"))
        .on_navigation(workspace_navigation)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny);
    let window = builder.build()?;
    crate::native_window::register(&window)?;
    let default_restored = super::geometry::apply_default(&window)?;
    if !default_restored && let (Some(x), Some(y)) = (state.x, state.y) {
        let displays = window
            .available_monitors()?
            .into_iter()
            .map(|monitor| {
                let area = *monitor.work_area();
                super::policy::DisplayArea {
                    x: area.position.x,
                    y: area.position.y,
                    width: area.size.width,
                    height: area.size.height,
                    scale_factor: monitor.scale_factor(),
                }
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
    #[test]
    fn configured_https_diagram_frames_are_permitted_without_trusting_their_origin() {
        let remote = url::Url::parse("https://diagrams.example.test/?embed=1").unwrap();
        assert!(workspace_navigation(&remote));
        assert!(!trusted_navigation(&remote));
        for target in [
            "http://diagrams.example.test/",
            "https://user:secret@diagrams.example.test/",
            "javascript:alert(1)",
            "file:///tmp/private.md",
        ] {
            assert!(!workspace_navigation(&url::Url::parse(target).unwrap()));
        }
    }
}
