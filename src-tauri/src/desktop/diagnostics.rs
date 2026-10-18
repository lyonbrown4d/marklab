use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::State;
#[derive(Default)]
pub struct Diagnostics(Mutex<HashMap<String, Rate>>);
struct Rate {
    started: Instant,
    count: u32,
}
#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Level {
    Debug,
    Error,
    Info,
    Warn,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ErrorReport {
    message: String,
    name: Option<String>,
    stack: Option<String>,
}
#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Report {
    error: Option<ErrorReport>,
    event: String,
    level: Level,
    message: Option<String>,
    scope: String,
}
#[derive(Serialize)]
pub struct ReportResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<&'static str>,
}
fn invalid() -> BackendError {
    BackendError::new("INVALID_DIAGNOSTIC", "Invalid renderer diagnostic report")
}
fn bounded(value: &str, maximum: usize) -> BackendResult<()> {
    if value.is_empty() || value.encode_utf16().count() > maximum {
        return Err(invalid());
    }
    Ok(())
}
fn identifier(value: &str) -> BackendResult<()> {
    let mut bytes = value.bytes();
    if value.len() > 64
        || !bytes
            .next()
            .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        || !bytes.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b".-".contains(&c))
    {
        return Err(invalid());
    }
    Ok(())
}
impl Report {
    fn validate(&self) -> BackendResult<()> {
        identifier(&self.scope)?;
        identifier(&self.event)?;
        if let Some(message) = &self.message {
            bounded(message, 500)?;
        }
        if let Some(error) = &self.error {
            bounded(&error.message, 500)?;
            if let Some(name) = &error.name {
                bounded(name, 100)?;
            }
            if let Some(stack) = &error.stack {
                bounded(stack, 4000)?;
            }
        }
        Ok(())
    }
}
impl Diagnostics {
    fn accept(&self, owner: &str, now: Instant) -> BackendResult<bool> {
        let mut rates = self
            .0
            .lock()
            .map_err(|_| BackendError::new("STATE_ERROR", "Diagnostic limits are unavailable"))?;
        rates.retain(|_, rate| now.duration_since(rate.started) < Duration::from_secs(60));
        let rate = rates.entry(owner.into()).or_insert(Rate {
            started: now,
            count: 0,
        });
        if rate.count >= 60 {
            return Ok(false);
        }
        rate.count += 1;
        Ok(true)
    }
}
#[tauri::command]
pub async fn diagnostics_renderer_report(
    window: TrustedWindow,
    state: State<'_, Diagnostics>,
    request: Report,
) -> BackendResult<ReportResult> {
    if !state.accept(window.label(), Instant::now())? {
        return Ok(ReportResult {
            ok: false,
            reason: Some("rate-limited"),
        });
    }
    request.validate()?;
    // JSON escaping keeps newlines/control characters in renderer text from
    // forging additional native log records.
    let fields = serde_json::to_string(&request)?;
    let owner = window.label();
    match request.level {
        Level::Debug => log::debug!(target: "renderer", "{owner}: {fields}"),
        Level::Error => log::error!(target: "renderer", "{owner}: {fields}"),
        Level::Info => log::info!(target: "renderer", "{owner}: {fields}"),
        Level::Warn => log::warn!(target: "renderer", "{owner}: {fields}"),
    }
    Ok(ReportResult {
        ok: true,
        reason: None,
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseError {
    message: String,
}
#[tauri::command]
pub async fn window_report_close_error(
    window: TrustedWindow,
    request: CloseError,
) -> BackendResult<()> {
    bounded(&request.message, 2048)?;
    use tauri_plugin_dialog::DialogExt;
    window
        .dialog()
        .message(request.message)
        .title("Marklab — Save failed")
        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
        .show(|_| {});
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn diagnostics_enforce_original_dto_bounds() {
        let mut report = Report {
            error: None,
            event: "workspace.ready".into(),
            level: Level::Info,
            message: None,
            scope: "renderer.boot".into(),
        };
        assert!(report.validate().is_ok());
        report.scope = "../untrusted\nrecord".into();
        assert!(report.validate().is_err());
        report.scope = "renderer.boot".into();
        report.message = Some("😀".repeat(251));
        assert!(report.validate().is_err());
    }
    #[test]
    fn limits_are_per_window_and_reset_after_one_minute() {
        let state = Diagnostics::default();
        let now = Instant::now();
        for _ in 0..60 {
            assert!(state.accept("main", now).is_ok_and(|value| value));
        }
        assert!(state.accept("main", now).is_ok_and(|value| !value));
        assert!(
            state
                .accept("workspace-other", now)
                .is_ok_and(|value| value)
        );
        assert!(
            state
                .accept("main", now + Duration::from_secs(60))
                .is_ok_and(|value| value)
        );
    }
}
