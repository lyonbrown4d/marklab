use super::network;
use crate::{assets::AssetService, error::BackendResult, native_window::TrustedWindow};
use std::sync::{Arc, Mutex};
use tauri::{
  Manager, Webview, WebviewBuilder, WebviewUrl,
  webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
};
use tokio::sync::oneshot;

struct Navigation {
  allowed: String,
  loaded: Option<oneshot::Sender<()>>,
}
struct Grants {
  app: tauri::AppHandle,
  label: String,
}
impl Drop for Grants {
  fn drop(&mut self) {
    let app = self.app.clone();
    let label = self.label.clone();
    tauri::async_runtime::spawn(async move {
      let _ = crate::blocking::run(move || app.state::<AssetService>().revoke_window(&label)).await;
    });
  }
}
pub(super) struct Worker {
  pub owner: String,
  generation: u64,
  view: Option<Webview>,
  navigation: Arc<Mutex<Navigation>>,
  grants: Arc<Grants>,
}
impl Drop for Worker {
  fn drop(&mut self) {
    if let Some(view) = self.view.take() {
      let _ = view.close();
    }
  }
}
impl Worker {
  pub async fn new(window: &TrustedWindow, generation: u64) -> BackendResult<Self> {
    super::super::ensure_generation(window.app_handle(), window.label(), generation)?;
    let label = format!("capture-{}", uuid::Uuid::new_v4());
    let navigation = Arc::new(Mutex::new(Navigation {
      allowed: "about:blank".into(),
      loaded: None,
    }));
    let allowed = navigation.clone();
    let loaded = navigation.clone();
    let builder = WebviewBuilder::new(
      &label,
      WebviewUrl::External(
        url::Url::parse("about:blank")
          .map_err(|_| network::failure("Invalid preview reset URL"))?,
      ),
    )
    .incognito(true)
    .devtools(false)
    .focused(false)
    .disable_javascript()
    .on_download(|_, _| false)
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .on_permission_request(|_, _| PermissionResponse::Deny)
    .on_navigation(move |url| {
      allowed
        .lock()
        .is_ok_and(|state| state.allowed == url.as_str())
    })
    .on_page_load(move |_, payload| {
      if payload.event() == PageLoadEvent::Finished
        && let Ok(mut state) = loaded.lock()
        && state.allowed == payload.url().as_str()
        && let Some(sender) = state.loaded.take()
      {
        let _ = sender.send(());
      }
    });
    let worker = Self {
      owner: window.label().into(),
      generation,
      view: None,
      navigation,
      grants: Arc::new(Grants {
        app: window.app_handle().clone(),
        label,
      }),
    };
    let parent = window.as_ref().as_ref().window();
    crate::blocking::run(move || {
      let mut worker = worker;
      super::super::ensure_generation(&worker.grants.app, &worker.owner, generation)?;
      worker.view = Some(parent.add_child(
        builder,
        tauri::LogicalPosition::new(-10000., -10000.),
        tauri::LogicalSize::new(1920., 1080.),
      )?);
      Ok(worker)
    })
    .await
  }
  pub fn matches(&self, owner: &str, generation: u64) -> bool {
    self.owner == owner && self.generation == generation
  }
  pub fn view(&self) -> BackendResult<&Webview> {
    self
      .view
      .as_ref()
      .ok_or_else(|| network::failure("Preview worker is unavailable"))
  }
  pub async fn document(&mut self, html: String) -> BackendResult<()> {
    let grants = self.grants.clone();
    let owner = self.owner.clone();
    let generation = self.generation;
    // The grant owner remains alive inside a cancelled blocking issuance,
    // so its final revocation cannot race ahead of that issuance.
    let capability = crate::blocking::run(move || {
      super::super::ensure_generation(&grants.app, &owner, generation)?;
      grants.app.state::<AssetService>().issue_bytes(
        &grants.label,
        html.as_bytes(),
        "preview.html",
        "text/html",
      )
    })
    .await?;
    let allowed = crate::assets::resource_url(&capability.url);
    let url =
      url::Url::parse(&allowed).map_err(|_| network::failure("Invalid preview capability"))?;
    let (sender, loaded) = oneshot::channel();
    {
      let mut state = self
        .navigation
        .lock()
        .map_err(|_| network::failure("Preview navigation state is unavailable"))?;
      state.allowed = allowed;
      state.loaded = Some(sender);
    }
    let view = self.view()?.clone();
    crate::blocking::run(move || view.navigate(url).map_err(Into::into)).await?;
    loaded
      .await
      .map_err(|_| network::failure("Web preview document failed to load"))
  }
  pub async fn reset(&mut self) -> BackendResult<()> {
    self.document("<!doctype html><html><head><meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'\"></head><body></body></html>".into()).await?;
    let grants = self.grants.clone();
    crate::blocking::run(move || {
      // Sanitized JavaScript-disabled documents have no remote storage.
      // Do not clear the platform's potentially shared incognito store:
      // that could remove login cookies belonging to live web tabs.
      grants
        .app
        .state::<AssetService>()
        .revoke_window(&grants.label)
    })
    .await
  }
}
