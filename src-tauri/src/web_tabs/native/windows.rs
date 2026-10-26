use super::*;
use ::windows::{
  Win32::UI::Input::KeyboardAndMouse::{
    GetKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
  },
  core::BOOL,
};
use tauri_runtime_wry::WebviewWryExt;
use webview2_com::{
  AcceleratorKeyPressedEventHandler, FocusChangedEventHandler, Microsoft::Web::WebView2::Win32::*,
};

pub async fn action(view: &Webview, action: &'static str) -> BackendResult<()> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_wry_webview(move |platform| {
    let result = (|| -> ::windows::core::Result<()> {
      // SAFETY: Tauri dispatches this closure on the owning COM/UI thread.
      let webview = unsafe { platform.controller().CoreWebView2()? };
      unsafe {
        match action {
          "back" => webview.GoBack(),
          "forward" => webview.GoForward(),
          "reload" => webview.Reload(),
          "stop" => webview.Stop(),
          _ => Ok(()),
        }
      }
    })()
    .map_err(|error| failure(&error.to_string()));
    let _ = sender.send(result);
  })?;
  receiver
    .await
    .map_err(|_| failure("Native web tab action was cancelled"))?
}
pub fn refresh(manager: WebTabs, window: TrustedWindow, id: String, view: &Webview) {
  let _ = view.with_wry_webview(move |platform| {
    let result = (|| -> ::windows::core::Result<(bool, bool)> {
      let webview = unsafe { platform.controller().CoreWebView2()? };
      let mut back = BOOL::default();
      let mut forward = BOOL::default();
      unsafe {
        webview.CanGoBack(&mut back)?;
        webview.CanGoForward(&mut forward)?;
      }
      Ok((back.as_bool(), forward.as_bool()))
    })();
    if let Ok((back, forward)) = result {
      manager.change(&window, &id, |entry| {
        entry.state.can_go_back = back;
        entry.state.can_go_forward = forward;
      });
    }
  });
}
pub async fn install_monitor(
  manager: WebTabs,
  window: TrustedWindow,
  id: String,
  view: &Webview,
  focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<Option<usize>> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_wry_webview(move |platform| {
    let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, event| {
      let Some(event) = event else {
        return Ok(());
      };
      let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
      let mut key = 0;
      let mut physical = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
      unsafe {
        event.KeyEventKind(&mut kind)?;
        event.VirtualKey(&mut key)?;
        event.PhysicalKeyStatus(&mut physical)?;
      }
      if ![
        COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN,
        COREWEBVIEW2_KEY_EVENT_KIND_SYSTEM_KEY_DOWN,
      ]
      .contains(&kind)
        || physical.WasKeyDown.as_bool()
      {
        return Ok(());
      }
      let Some(key) = key_name(key) else {
        return Ok(());
      };
      let down = |key| unsafe { GetKeyState(key) < 0 };
      let modifiers = shortcuts::Modifiers {
        alt: down(VK_MENU.0 as i32),
        control: down(VK_CONTROL.0 as i32),
        meta: down(VK_LWIN.0 as i32) || down(VK_RWIN.0 as i32),
        shift: down(VK_SHIFT.0 as i32),
      };
      if manager.shortcut(&window, &id, &key, modifiers) {
        unsafe {
          event.SetHandled(true)?;
        }
      }
      Ok(())
    }));
    let controller = platform.controller();
    let result = (|| -> ::windows::core::Result<Option<usize>> {
      let mut keys = 0i64;
      unsafe {
        controller.add_AcceleratorKeyPressed(&handler, &mut keys)?;
      }
      let received = focused.clone();
      let got = FocusChangedEventHandler::create(Box::new(move |_, _| {
        received.store(true, std::sync::atomic::Ordering::Release);
        Ok(())
      }));
      let lost_focus = focused.clone();
      let lost = FocusChangedEventHandler::create(Box::new(move |_, _| {
        lost_focus.store(false, std::sync::atomic::Ordering::Release);
        Ok(())
      }));
      let mut got_token = 0i64;
      let mut lost_token = 0i64;
      if let Err(error) = unsafe { controller.add_GotFocus(&got, &mut got_token) } {
        let _ = unsafe { controller.remove_AcceleratorKeyPressed(keys) };
        return Err(error);
      }
      if let Err(error) = unsafe { controller.add_LostFocus(&lost, &mut lost_token) } {
        let _ = unsafe { controller.remove_AcceleratorKeyPressed(keys) };
        let _ = unsafe { controller.remove_GotFocus(got_token) };
        return Err(error);
      }
      Ok(Some(Box::into_raw(Box::new(Monitor {
        keys,
        got: got_token,
        lost: lost_token,
        focused,
      })) as usize))
    })()
    .map_err(|error| failure(&error.to_string()));
    let _ = sender.send(result);
  })?;
  receiver
    .await
    .map_err(|_| failure("Native shortcut installation was cancelled"))?
}
struct Monitor {
  keys: i64,
  got: i64,
  lost: i64,
  focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
}
pub fn remove_monitor(view: &Webview, token: Option<usize>) {
  if let Some(token) = token {
    // SAFETY: the one Entry owning this native registration releases the
    // allocation exactly once. Native callbacks only retain their own Arc.
    let token = unsafe { Box::from_raw(token as *mut Monitor) };
    token
      .focused
      .store(false, std::sync::atomic::Ordering::Release);
    let _ = view.with_wry_webview(move |platform| {
      let controller = platform.controller();
      unsafe {
        let _ = controller.remove_AcceleratorKeyPressed(token.keys);
        let _ = controller.remove_GotFocus(token.got);
        let _ = controller.remove_LostFocus(token.lost);
      }
    });
  }
}
pub async fn focused(
  view: &Webview,
  focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<bool> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  // The UI-thread barrier observes native GotFocus/LostFocus before answering.
  view.with_wry_webview(move |platform| {
    let mut visible = BOOL::default();
    let result = unsafe { platform.controller().IsVisible(&mut visible) }
      .map(|_| visible.as_bool() && focused.load(std::sync::atomic::Ordering::Acquire))
      .map_err(|error| failure(&error.to_string()));
    let _ = sender.send(result);
  })?;
  receiver
    .await
    .map_err(|_| failure("Native web tab focus query was cancelled"))?
}
fn key_name(key: u32) -> Option<String> {
  match key {
    0x30..=0x39 | 0x41..=0x5a => {
      char::from_u32(key).map(|key| key.to_ascii_lowercase().to_string())
    }
    0x70..=0x87 => Some(format!("f{}", key - 0x6f)),
    0x09 => Some("tab".into()),
    0x0d => Some("enter".into()),
    0x1b => Some("escape".into()),
    0x20 => Some("space".into()),
    0x21 => Some("pageup".into()),
    0x22 => Some("pagedown".into()),
    0x08 => Some("backspace".into()),
    0x23 => Some("end".into()),
    0x24 => Some("home".into()),
    0x2e => Some("delete".into()),
    0xba => Some(";".into()),
    0xbb => Some("=".into()),
    0xbc => Some(",".into()),
    0xbd => Some("-".into()),
    0xbe => Some(".".into()),
    0xbf => Some("/".into()),
    0xc0 => Some("`".into()),
    0xdc => Some("\\".into()),
    0xde => Some("'".into()),
    0x25 => Some("left".into()),
    0x26 => Some("up".into()),
    0x27 => Some("right".into()),
    0x28 => Some("down".into()),
    0xdb => Some("[".into()),
    0xdd => Some("]".into()),
    _ => None,
  }
}
