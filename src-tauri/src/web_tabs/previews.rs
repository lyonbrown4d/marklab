use super::*;

impl WebTabs {
  pub(crate) fn preview_revision(&self, owner: &str, instance: &str, url: &str) -> Option<u64> {
    self
      .inner
      .owners
      .lock()
      .ok()?
      .get(owner)?
      .entries
      .values()
      .find(|entry| {
        entry.instance == instance
          && entry.state.url == url
          && entry.state.status == TabStatus::Ready
      })
      .map(|entry| entry.generation)
  }
}

pub(super) fn capture_hidden(manager: &WebTabs, window: &TrustedWindow, entry: &Entry) {
  if !entry.state.active
    || manager
      .preview_revision(window.label(), &entry.instance, &entry.state.url)
      .is_none()
  {
    return;
  }
  if let Some(view) = &entry.view {
    capture(
      window.clone(),
      view.clone(),
      entry.state.url.clone(),
      entry.workspace_generation,
    );
  }
}

pub(super) fn capture(window: TrustedWindow, view: Webview, url: String, generation: u64) {
  // Native lifecycle callbacks may run on a thread without Tokio entered.
  // Sharing Tauri's configured runtime also keeps hiding the view nonblocking.
  tauri::async_runtime::spawn(async move {
    let Some(service) = window
      .try_state::<crate::link_preview::LinkPreviewService>()
      .map(|service| service.inner().clone())
    else {
      return;
    };
    let _ = service.capture_web_tab(window, view, url, generation).await;
  });
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn capture_revisions_reject_loading_replaced_and_navigated_tabs_but_allow_hidden_ready_views() {
    let manager = WebTabs::default();
    let mut entry = super::super::tests::entry("one", false, 0);
    entry.state.status = TabStatus::Ready;
    entry.generation = 4;
    manager
      .inner
      .owners
      .lock()
      .unwrap()
      .entry("main".into())
      .or_default()
      .entries
      .insert("one".into(), entry);
    assert_eq!(
      manager.preview_revision("main", "new-native-view", "https://example.com/"),
      Some(4)
    );
    assert_eq!(
      manager.preview_revision("main", "old-native-view", "https://example.com/"),
      None
    );
    assert_eq!(
      manager.preview_revision("main", "new-native-view", "https://other.test/"),
      None
    );
    {
      let mut owners = manager.inner.owners.lock().unwrap();
      let entry = owners
        .get_mut("main")
        .unwrap()
        .entries
        .get_mut("one")
        .unwrap();
      entry.state.status = TabStatus::Loading;
      entry.generation += 1;
    }
    assert_eq!(
      manager.preview_revision("main", "new-native-view", "https://example.com/"),
      None
    );
  }
}
