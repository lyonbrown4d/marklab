use super::*;
use tauri_runtime_cef::{WebviewCefExt, cef::ImplBrowser};

pub async fn action(view: &Webview, action: &'static str) -> BackendResult<()> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_cef_webview(move |platform| {
    let browser = platform.browser();
    match action {
      "back" => browser.go_back(),
      "forward" => browser.go_forward(),
      "reload" => browser.reload(),
      "stop" => browser.stop_load(),
      _ => (),
    }
    let _ = sender.send(());
  })?;
  tokio::time::timeout(std::time::Duration::from_secs(2), receiver)
    .await
    .map_err(|_| failure("Native web tab action timed out"))?
    .map_err(|_| failure("Native web tab action was cancelled"))?;
  Ok(())
}

pub fn refresh(manager: WebTabs, window: TrustedWindow, id: String, view: &Webview) {
  let _ = view.with_cef_webview(move |platform| {
    let browser = platform.browser();
    manager.change(&window, &id, |entry| {
      entry.state.can_go_back = browser.can_go_back() != 0;
      entry.state.can_go_forward = browser.can_go_forward() != 0;
    });
  });
}
