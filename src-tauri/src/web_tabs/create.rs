use super::*;
use tauri::{
  WebviewBuilder, WebviewUrl,
  webview::{NewWindowResponse, PageLoadEvent, PermissionResponse},
};
pub async fn view(
  manager: &WebTabs,
  window: &TrustedWindow,
  id: &str,
  instance: &str,
  url: url::Url,
  bounds: &Bounds,
) -> BackendResult<Webview> {
  let navigation_manager = manager.clone();
  let navigation_owner = window.clone();
  let navigation_id = id.to_owned();
  let navigation_instance = instance.to_owned();
  let page_manager = manager.clone();
  let page_owner = window.clone();
  let page_id = id.to_owned();
  let page_instance = instance.to_owned();
  let title_manager = manager.clone();
  let title_owner = window.clone();
  let title_id = id.to_owned();
  let title_instance = instance.to_owned();
  let new_owner = window.clone();
  let new_id = id.to_owned();
  let builder = WebviewBuilder::new(instance, WebviewUrl::External(url))
    .incognito(true)
    .focused(false)
    .devtools(false)
    .on_download(|_, _| false)
    .on_permission_request(|_, _| PermissionResponse::Deny)
    .on_navigation(move |url| {
      if !navigation_manager.current(
        navigation_owner.label(),
        &navigation_id,
        &navigation_instance,
      ) {
        return false;
      }
      if let Ok(url) = normalize(url.as_str()) {
        navigation_manager.loading(&navigation_owner, &navigation_id, url.into());
        true
      } else {
        false
      }
    })
    .on_new_window(move |url, _| {
      if let Ok(url) = normalize(url.as_str()) {
        let _ = new_owner.emit_to(
          tauri::EventTarget::webview_window(new_owner.label()),
          "web-tabs-state",
          Event::OpenRequested {
            tab_id: new_id.clone(),
            url: url.into(),
          },
        );
      }
      NewWindowResponse::Deny
    })
    .on_document_title_changed(move |_, title| {
      if !title_manager.current(title_owner.label(), &title_id, &title_instance) {
        return;
      }
      title_manager.change(&title_owner, &title_id, |v| {
        v.state.title = bounded_text(&title, 512)
      })
    })
    .on_page_load(move |_, payload| {
      if !page_manager.current(page_owner.label(), &page_id, &page_instance) {
        return;
      }
      if payload.event() == PageLoadEvent::Finished {
        page_manager.ready(&page_owner, &page_id);
      } else {
        page_manager.loading(&page_owner, &page_id, payload.url().to_string());
      }
    });
  let parent = window.as_ref().as_ref().window();
  let position = tauri::LogicalPosition::new(bounds.x as f64, bounds.y as f64);
  let size = tauri::LogicalSize::new(bounds.width as f64, bounds.height as f64);
  let view = crate::blocking::run(move || Ok(parent.add_child(builder, position, size)?)).await?;
  if let Err(error) = view.hide() {
    let _ = view.close();
    return Err(error.into());
  }
  Ok(view)
}
pub fn bounds(window: &TrustedWindow, bounds: &Bounds) -> BackendResult<Bounds> {
  let size = window.inner_size()?;
  let scale = window.scale_factor()?;
  let width = (size.width as f64 / scale).max(1.) as i32;
  let height = (size.height as f64 / scale).max(1.) as i32;
  clip(bounds, width, height)
}
pub(super) fn clip(bounds: &Bounds, width: i32, height: i32) -> BackendResult<Bounds> {
  if bounds.width == 0 || bounds.height == 0 || width <= 0 || height <= 0 {
    return Err(failure("Web tab dimensions must be positive"));
  }
  let x = bounds.x.clamp(0, width - 1);
  let y = bounds.y.clamp(0, height - 1);
  Ok(Bounds {
    x,
    y,
    width: bounds.width.min((width - x) as u32).max(1),
    height: bounds.height.min((height - y) as u32).max(1),
  })
}
pub fn set_bounds(view: &Webview, bounds: &Bounds) -> BackendResult<()> {
  view.set_position(tauri::LogicalPosition::new(
    bounds.x as f64,
    bounds.y as f64,
  ))?;
  view.set_size(tauri::LogicalSize::new(
    bounds.width as f64,
    bounds.height as f64,
  ))?;
  Ok(())
}
