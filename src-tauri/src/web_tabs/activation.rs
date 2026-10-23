use super::*;
use crate::workspace::WorkspaceRegistry;
use tauri::State;
#[tauri::command]
#[specta::specta]
pub async fn web_tabs_activate(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  manager: State<'_, WebTabs>,
  request: Activate,
) -> BackendResult<OkResult> {
  let generation = registry.get(window.label())?.generation;
  registry.get(window.label())?.ensure_active()?;
  identifier(&request.tab_id)?;
  let url = normalize(&request.url)?;
  let _guard = manager.inner.operations.lock().await;
  if registry.get(window.label())?.generation != generation {
    return Err(failure(
      "Workspace changed while waiting to activate web tab",
    ));
  }
  let bounds = create::bounds(&window, &request.bounds)?;
  for entry in manager.entries(window.label()) {
    if entry.state.tab_id != request.tab_id {
      previews::capture_hidden(&manager, &window, &entry);
      if let Some(view) = entry.view {
        view.hide()?;
      }
      manager.change(&window, &entry.state.tab_id, |v| v.state.active = false);
    }
  }
  let existed = manager.entry(window.label(), &request.tab_id).ok();
  if existed.as_ref().is_none_or(|entry| entry.view.is_none()) {
    if existed.is_none()
      && let Some(id) = eviction_candidate(&manager.entries(window.label()))?
    {
      commands::close(&window, &manager, &id)?;
    }
    // Views stay assigned to their tab: history, forms and callbacks cannot be
    // safely reassigned to another tab as a generic connection pool would do.
    let instance = format!("tab-{}", uuid::Uuid::new_v4());
    manager
      .inner
      .owners
      .lock()
      .map_err(|_| failure("Web tab state unavailable"))?
      .entry(window.label().into())
      .or_default()
      .entries
      .insert(
        request.tab_id.clone(),
        Entry {
          view: None,
          state: TabState {
            active: true,
            can_go_back: false,
            can_go_forward: false,
            error: None,
            status: TabStatus::Loading,
            tab_id: request.tab_id.clone(),
            title: String::new(),
            url: url.to_string(),
          },
          bounds: bounds.clone(),
          touched: manager
            .inner
            .clock
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed),
          generation: 0,
          workspace_generation: generation,
          monitor: None,
          instance: instance.clone(),
          load: None,
          focused: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        },
      );
    let view = match create::view(
      &manager,
      &window,
      &request.tab_id,
      &instance,
      url.clone(),
      &bounds,
    )
    .await
    {
      Ok(view) => view,
      Err(error) => {
        manager.change(&window, &request.tab_id, |v| {
          v.state.status = TabStatus::Error;
          v.state.error = Some(TabError {
            description: bounded_text(&error.message, 1024),
          });
        });
        return Err(error);
      }
    };
    let mut created = CreatedView {
      view: Some(view),
      monitor: None,
    };
    let entry = manager.entry(window.label(), &request.tab_id)?;
    if entry.instance != instance {
      return Err(failure(
        "Web tab owner changed while creating the native view",
      ));
    }
    created.monitor = native::install_monitor(
      manager.inner().clone(),
      window.clone(),
      request.tab_id.clone(),
      created.view()?,
      entry.focused,
    )
    .await?;
    created.commit(&manager, window.label(), &request.tab_id, &instance)?;
  }
  manager.change(&window, &request.tab_id, |entry| {
    entry.state.active = true;
    entry.bounds = bounds.clone();
    entry.touched = manager
      .inner
      .clock
      .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
  });
  let entry = manager.entry(window.label(), &request.tab_id)?;
  if let Some(view) = entry.view {
    create::set_bounds(&view, &bounds)?;
    if entry.state.url != url.as_str() || entry.state.status == TabStatus::Error {
      manager.loading(&window, &request.tab_id, url.to_string());
      view.navigate(url)?;
    } else if entry.state.status == TabStatus::Ready {
      view.show()?;
    }
  }
  Ok(success())
}

const RESIDENT_LIMIT: usize = 3;

// Count failed placeholders too, so repeated creation failures cannot grow the
// registry unboundedly. Existing assigned views do not need another slot.
pub(super) fn eviction_candidate(entries: &[Entry]) -> BackendResult<Option<String>> {
  if entries.len() < RESIDENT_LIMIT {
    return Ok(None);
  }
  entries
    .iter()
    .filter(|entry| !entry.state.active)
    .min_by_key(|entry| entry.touched)
    .map(|entry| Some(entry.state.tab_id.clone()))
    .ok_or_else(|| failure("Web tab pool has no inactive slot"))
}

struct CreatedView {
  view: Option<Webview>,
  monitor: Option<usize>,
}
impl CreatedView {
  fn view(&self) -> BackendResult<&Webview> {
    self
      .view
      .as_ref()
      .ok_or_else(|| failure("Web tab view unavailable"))
  }
  fn commit(
    mut self,
    manager: &WebTabs,
    owner: &str,
    id: &str,
    instance: &str,
  ) -> BackendResult<()> {
    let mut owners = manager
      .inner
      .owners
      .lock()
      .map_err(|_| failure("Web tab state unavailable"))?;
    let entry = owners
      .get_mut(owner)
      .and_then(|owner| owner.entries.get_mut(id))
      .filter(|entry| entry.instance == instance)
      .ok_or_else(|| failure("Web tab owner closed while creating the native view"))?;
    entry.view = self.view.take();
    entry.monitor = self.monitor.take();
    Ok(())
  }
}
impl Drop for CreatedView {
  fn drop(&mut self) {
    // Own uncommitted native resources until the registry accepts them.
    if let Some(view) = self.view.take() {
      native::remove_monitor(&view, self.monitor.take());
      let _ = view.close();
    }
  }
}
