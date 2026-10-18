mod activation;
mod commands;
mod create;
mod native;
mod shortcuts;
mod types;
use crate::{
    error::{BackendError, BackendResult},
    native_window::TrustedWindow,
};
pub use activation::*;
pub use commands::*;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Webview};
use types::*;
#[derive(Clone)]
struct Entry {
    view: Option<Webview>,
    state: TabState,
    bounds: Bounds,
    touched: u64,
    generation: u64,
    monitor: Option<usize>,
    instance: String,
    load: Option<tokio::task::AbortHandle>,
    focused: Arc<std::sync::atomic::AtomicBool>,
}
#[derive(Default)]
struct Owner {
    entries: HashMap<String, Entry>,
    bindings: Vec<shortcuts::Shortcut>,
}
#[derive(Default)]
struct Inner {
    owners: Mutex<HashMap<String, Owner>>,
    clock: std::sync::atomic::AtomicU64,
    operations: tokio::sync::Mutex<()>,
}
#[derive(Default, Clone)]
pub struct WebTabs {
    inner: Arc<Inner>,
}
fn failure(message: &str) -> BackendError {
    BackendError::new("WEB_TAB_ERROR", message)
}
fn normalize(value: &str) -> BackendResult<url::Url> {
    let url = url::Url::parse(value.trim()).map_err(|_| failure("Web tab URL must be absolute"))?;
    if value.len() > 4096
        || value.chars().any(char::is_control)
        || !["http", "https"].contains(&url.scheme())
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(failure(
            "Web tabs require an HTTP(S) URL without credentials",
        ));
    }
    if url.as_str().len() > 4096 {
        return Err(failure("Normalized web tab URL exceeds maximum length"));
    }
    Ok(url)
}
fn identifier(value: &str) -> BackendResult<()> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|v| v.is_ascii_alphanumeric() || b"._:-".contains(&v))
    {
        return Err(failure("Invalid web tab identifier"));
    }
    Ok(())
}
impl WebTabs {
    pub fn close_window(&self, owner: &str) {
        let entries = if let Ok(mut owners) = self.inner.owners.lock() {
            owners
                .remove(owner)
                .map(|v| v.entries.into_values().collect::<Vec<_>>())
                .unwrap_or_default()
        } else {
            vec![]
        };
        for entry in entries {
            if let Some(load) = entry.load {
                load.abort();
            }
            if let Some(view) = entry.view {
                native::remove_monitor(&view, entry.monitor);
                let _ = view.close();
            }
        }
    }
    pub async fn focused_view(&self, owner: &str) -> BackendResult<Option<Webview>> {
        let _operation = self.inner.operations.lock().await;
        for entry in self.entries(owner) {
            if let Some(view) = entry.view
                && native::focused(&view, entry.focused).await?
            {
                return Ok(Some(view));
            }
        }
        Ok(None)
    }

    pub fn suspend(&self, owner: &str) {
        for entry in self.entries(owner) {
            if let Some(view) = entry.view {
                let _ = view.hide();
            }
        }
    }
    pub fn resume(&self, owner: &str) {
        for entry in self.entries(owner) {
            if entry.state.active
                && entry.state.status == "ready"
                && let Some(view) = entry.view
            {
                let _ = view.show();
            }
        }
    }
    fn entries(&self, owner: &str) -> Vec<Entry> {
        self.inner
            .owners
            .lock()
            .ok()
            .and_then(|v| v.get(owner).map(|v| v.entries.values().cloned().collect()))
            .unwrap_or_default()
    }
    fn entry(&self, owner: &str, id: &str) -> BackendResult<Entry> {
        identifier(id)?;
        self.inner
            .owners
            .lock()
            .map_err(|_| failure("Web tab state is unavailable"))?
            .get(owner)
            .and_then(|v| v.entries.get(id))
            .cloned()
            .ok_or_else(|| failure("Unknown web tab"))
    }
    fn current(&self, owner: &str, id: &str, instance: &str) -> bool {
        self.inner.owners.lock().is_ok_and(|owners| {
            owners
                .get(owner)
                .and_then(|owner| owner.entries.get(id))
                .is_some_and(|entry| entry.instance == instance)
        })
    }

    fn change(&self, window: &TrustedWindow, id: &str, work: impl FnOnce(&mut Entry)) {
        let state = if let Ok(mut owners) = self.inner.owners.lock() {
            owners
                .get_mut(window.label())
                .and_then(|v| v.entries.get_mut(id))
                .map(|entry| {
                    work(entry);
                    entry.state.clone()
                })
        } else {
            None
        };
        if let Some(state) = state {
            let _ = window.emit_to(
                tauri::EventTarget::webview_window(window.label()),
                "web-tabs-state",
                Event::State { state },
            );
        }
    }
    fn loading(&self, window: &TrustedWindow, id: &str, url: String) {
        self.change(window, id, |entry| {
            if let Some(load) = entry.load.take() {
                load.abort();
            }
            entry.generation += 1;
            entry.state.status = "loading".into();
            entry.state.error = None;
            entry.state.url = url;
        });
        if let Ok(entry) = self.entry(window.label(), id) {
            if let Some(view) = entry.view {
                let _ = view.hide();
            }
            let generation = entry.generation;
            let instance = entry.instance;
            let manager = self.clone();
            let owner_window = window.clone();
            let timer_id = id.to_owned();
            let task = tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(15)).await;
                if manager
                    .entry(owner_window.label(), &timer_id)
                    .is_ok_and(|v| {
                        v.instance == instance
                            && v.generation == generation
                            && v.state.status == "loading"
                    })
                {
                    manager.change(&owner_window, &timer_id, |v| {
                        v.state.status = "error".into();
                        v.state.error = Some(TabError {
                            description: "Web page did not finish loading".into(),
                        });
                    });
                }
            });
            if let Ok(mut owners) = self.inner.owners.lock() {
                if let Some(entry) = owners
                    .get_mut(window.label())
                    .and_then(|owner| owner.entries.get_mut(id))
                {
                    entry.load = Some(task.abort_handle());
                } else {
                    task.abort();
                }
            } else {
                task.abort();
            }
        }
    }
    fn ready(&self, window: &TrustedWindow, id: &str) {
        self.change(window, id, |v| {
            if let Some(load) = v.load.take() {
                load.abort();
            }
            v.state.status = "ready".into();
            v.state.error = None;
        });
        if let Ok(entry) = self.entry(window.label(), id)
            && let Some(view) = entry.view
        {
            native::refresh(self.clone(), window.clone(), id.into(), &view);
            if entry.state.active {
                let _ = view.show();
            }
        }
    }
    fn shortcut(
        &self,
        window: &TrustedWindow,
        id: &str,
        key: &str,
        modifiers: shortcuts::Modifiers,
    ) -> bool {
        let action = self.inner.owners.lock().ok().and_then(|owners| {
            owners.get(window.label()).and_then(|owner| {
                owner
                    .bindings
                    .iter()
                    .rev()
                    .find(|binding| binding.key == key && binding.modifiers == modifiers)
                    .map(|binding| binding.action.clone())
            })
        });
        if let Some(action) = action {
            let _ = window.emit_to(
                tauri::EventTarget::webview_window(window.label()),
                "web-tabs-state",
                Event::Shortcut {
                    action,
                    tab_id: id.into(),
                },
            );
            true
        } else {
            false
        }
    }
}

fn bounded_text(value: &str, limit: usize) -> String {
    let mut used = 0;
    value
        .chars()
        .take_while(|character| {
            used += character.len_utf16();
            used <= limit
        })
        .collect()
}
#[cfg(test)]
mod tests;
