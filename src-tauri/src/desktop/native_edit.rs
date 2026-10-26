use super::controls::EditAction;
use crate::{
  error::{BackendError, BackendResult},
  native_window::TrustedWindow,
};
use tauri::Manager;
#[cfg(target_os = "windows")]
use tauri_runtime_wry::WebviewWryExt;
pub(super) async fn focused_child(window: &TrustedWindow) -> BackendResult<Option<tauri::Webview>> {
  let Some(tabs) = window.try_state::<crate::web_tabs::WebTabs>() else {
    return Ok(None);
  };
  tabs.focused_view(window.label()).await
}
pub(super) async fn dispatch_menu(window: &TrustedWindow, id: &str) -> BackendResult<()> {
  let action = match id {
    "edit.undo" => EditAction::Undo,
    "edit.redo" => EditAction::Redo,
    "edit.cut" => EditAction::Cut,
    "edit.copy" => EditAction::Copy,
    "edit.paste" => EditAction::Paste,
    "edit.select_all" => EditAction::SelectAll,
    _ => {
      return Err(BackendError::new(
        "INVALID_MENU_ACTION",
        "Unsupported editing action",
      ));
    }
  };
  if focused_child(window).await?.is_some() {
    execute(window, action).await
  } else {
    crate::desktop::event_contracts::MENU_ACTION.emit_to(
      window.app_handle(),
      tauri::EventTarget::webview_window(window.label()),
      &((id).to_string()),
    )?;
    Ok(())
  }
}
async fn focused_view(window: &TrustedWindow) -> BackendResult<tauri::Webview> {
  Ok(
    focused_child(window)
      .await?
      .unwrap_or_else(|| AsRef::<tauri::Webview>::as_ref(window.as_ref()).clone()),
  )
}
#[cfg(not(target_os = "windows"))]
pub async fn execute(window: &TrustedWindow, action: EditAction) -> BackendResult<()> {
  use tauri_runtime_cef::{
    WebviewCefExt,
    cef::{ImplBrowser, ImplFrame},
  };
  let view = focused_view(window).await?;
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_cef_webview(move |native| {
    let result = native
      .browser()
      .focused_frame()
      .ok_or_else(|| {
        BackendError::new(
          "EDIT_UNAVAILABLE",
          "The focused editing frame is unavailable",
        )
      })
      .map(|frame| match action {
        EditAction::Undo => frame.undo(),
        EditAction::Redo => frame.redo(),
        EditAction::Cut => frame.cut(),
        EditAction::Copy => frame.copy(),
        EditAction::Paste => frame.paste(),
        EditAction::SelectAll => frame.select_all(),
      });
    let _ = sender.send(result);
  })?;
  tokio::time::timeout(std::time::Duration::from_secs(5), receiver)
    .await
    .map_err(|_| BackendError::new("EDIT_TIMEOUT", "Native editing action timed out"))?
    .map_err(|_| BackendError::new("EDIT_CANCELLED", "Native editing action was cancelled"))?
}
#[cfg(target_os = "windows")]
pub async fn execute(window: &TrustedWindow, action: EditAction) -> BackendResult<()> {
  let view = focused_view(window).await?;
  if matches!(action, EditAction::Paste) {
    use tauri_plugin_clipboard_manager::ClipboardExt;
    let owner = window.clone();
    let text = tauri::async_runtime::spawn_blocking(move || owner.clipboard().read_text())
      .await
      .map_err(|error| BackendError::new("CLIPBOARD_FAILED", error.to_string()))?
      .map_err(|error| BackendError::new("CLIPBOARD_FAILED", error.to_string()))?;
    if text.len() > 8 * 1024 * 1024 {
      return Err(BackendError::new(
        "CLIPBOARD_TOO_LARGE",
        "Clipboard text exceeds 8 MiB",
      ));
    }
    let text = serde_json::to_string(&text)?;
    // WebView2 has no host editing API. A bounded clipboard event preserves
    // editor paste handlers; native form controls use insertText fallback.
    return windows_script(&view, format!("(()=>{{const text={text};const data=new DataTransfer();data.setData('text/plain',text);const target=document.activeElement;if(!target)return false;return !target.dispatchEvent(new ClipboardEvent('paste',{{bubbles:true,cancelable:true,clipboardData:data}}))||document.execCommand('insertText',false,text);}})()")).await;
  }
  let script = match action {
    EditAction::Undo => "document.execCommand('undo')",
    EditAction::Redo => "document.execCommand('redo')",
    EditAction::Cut => "document.execCommand('cut')",
    EditAction::Copy => "document.execCommand('copy')",
    EditAction::SelectAll => "document.execCommand('selectAll')",
    EditAction::Paste => return Ok(()),
  };
  windows_script(&view, script.into()).await
}

#[cfg(target_os = "windows")]
async fn windows_script(view: &tauri::Webview, script: String) -> BackendResult<()> {
  use std::sync::{Arc, Mutex};
  use webview2_com::{CoTaskMemPWSTR, ExecuteScriptCompletedHandler};
  let (sender, receiver) = tokio::sync::oneshot::channel();
  let pending = Arc::new(Mutex::new(Some(sender)));
  view.with_wry_webview(move |platform| {
    let callback_pending = pending.clone();
    let result = (|| -> ::windows::core::Result<()> {
      // SAFETY: Tauri dispatches on the COM/UI thread owning this controller.
      let view = unsafe { platform.controller().CoreWebView2()? };
      let callback = ExecuteScriptCompletedHandler::create(Box::new(move |status, json| {
        let outcome = status
          .map_err(|error| BackendError::new("EDIT_FAILED", error.to_string()))
          .and_then(|_| {
            if serde_json::from_str::<bool>(&json).unwrap_or(false) {
              Ok(())
            } else {
              Err(BackendError::new(
                "EDIT_UNAVAILABLE",
                "The focused control did not accept this editing action",
              ))
            }
          });
        if let Ok(mut sender) = callback_pending.lock()
          && let Some(sender) = sender.take()
        {
          let _ = sender.send(outcome);
        }
        Ok(())
      }));
      let script = CoTaskMemPWSTR::from(script.as_str());
      unsafe { view.ExecuteScript(*script.as_ref().as_pcwstr(), &callback) }
    })();
    if let Err(error) = result
      && let Ok(mut sender) = pending.lock()
      && let Some(sender) = sender.take()
    {
      let _ = sender.send(Err(BackendError::new("EDIT_FAILED", error.to_string())));
    }
  })?;
  tokio::time::timeout(std::time::Duration::from_secs(5), receiver)
    .await
    .map_err(|_| {
      BackendError::new(
        "EDIT_TIMEOUT",
        "The focused control did not finish the editing action",
      )
    })?
    .map_err(|_| BackendError::new("EDIT_CANCELLED", "The editing action was cancelled"))?
}
