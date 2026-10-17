use crate::error::{BackendError, BackendResult};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Source {
    Startup,
    SecondInstance,
    OpenUrl,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeepLink {
    url: String,
    source: Source,
    received_at: u64,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchInfo {
    args: Vec<String>,
    cwd: String,
    deep_links: Vec<DeepLink>,
}
#[derive(Default)]
struct Links {
    stored: Vec<DeepLink>,
    pending: Vec<DeepLink>,
}
#[derive(Default)]
pub struct LaunchState(Mutex<Links>);
fn normalize(value: &str) -> Option<String> {
    let value = value.trim();
    if value.is_empty() || value.encode_utf16().count() > 4096 {
        return None;
    }
    let url = url::Url::parse(value).ok()?;
    (url.scheme() == "marklab" && url.username().is_empty() && url.password().is_none())
        .then(|| url.to_string())
}
pub fn publish(app: &AppHandle, value: &str, source: Source) -> BackendResult<()> {
    let Some(url) = normalize(value) else {
        return Ok(());
    };
    let payload = DeepLink {
        url,
        source,
        received_at: crate::assets::now_ms(),
    };
    let state = app.state::<LaunchState>();
    let mut links = state
        .0
        .lock()
        .map_err(|_| BackendError::new("STATE_ERROR", "Launch history is unavailable"))?;
    links.stored.push(payload.clone());
    if links.stored.len() > 20 {
        links.stored.remove(0);
    }
    let delivered = super::menus::focused(app)
        .filter(|window| {
            app.state::<super::startup::StartupState>()
                .interactive(window.label())
        })
        .is_some_and(|window| window.emit("deep-link", &payload).is_ok());
    if !delivered {
        links.pending.push(payload);
        if links.pending.len() > 20 {
            links.pending.remove(0);
        }
    }
    Ok(())
}
pub fn flush(app: &AppHandle, window: &tauri::WebviewWindow) -> BackendResult<()> {
    let state = app.state::<LaunchState>();
    let mut links = state
        .0
        .lock()
        .map_err(|_| BackendError::new("STATE_ERROR", "Launch history is unavailable"))?;
    while let Some(payload) = links.pending.first() {
        window.emit("deep-link", payload)?;
        links.pending.remove(0);
    }
    Ok(())
}
pub fn info(app: &AppHandle) -> BackendResult<LaunchInfo> {
    Ok(LaunchInfo {
        args: std::env::args().skip(1).collect(),
        cwd: std::env::current_dir()?.to_string_lossy().into_owned(),
        deep_links: app
            .state::<LaunchState>()
            .0
            .lock()
            .map_err(|_| BackendError::new("STATE_ERROR", "Launch history is unavailable"))?
            .stored
            .clone(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn launch_links_require_the_registered_scheme_and_reject_embedded_credentials() {
        assert_eq!(
            normalize(" marklab://open?path=a.md ").as_deref(),
            Some("marklab://open?path=a.md")
        );
        assert!(normalize("https://example.com/").is_none());
        assert!(normalize("marklab://secret:password@open/path").is_none());
        assert!(normalize(&format!("marklab://open/{}", "a".repeat(4096))).is_none());
    }
}
