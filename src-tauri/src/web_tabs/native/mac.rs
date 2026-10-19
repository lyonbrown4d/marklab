use super::*;
use objc2_web_kit::WKWebView;
pub async fn action(view: &Webview, action: &'static str) -> BackendResult<()> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_webview(move |platform| {
    // Tauri owns this WKWebView and dispatches the closure on the native UI thread.
    let webview = unsafe { &*(platform.inner() as *const WKWebView) };
    unsafe {
      match action {
        "back" => {
          webview.goBack();
        }
        "forward" => {
          webview.goForward();
        }
        "reload" => {
          webview.reload();
        }
        "stop" => webview.stopLoading(),
        _ => (),
      }
    }
    let _ = sender.send(());
  })?;
  receiver
    .await
    .map_err(|_| failure("Native web tab action was cancelled"))?;
  Ok(())
}
pub fn refresh(manager: WebTabs, window: TrustedWindow, id: String, view: &Webview) {
  let _ = view.with_webview(move |platform| {
    let webview = unsafe { &*(platform.inner() as *const WKWebView) };
    manager.change(&window, &id, |entry| {
      entry.state.can_go_back = unsafe { webview.canGoBack() };
      entry.state.can_go_forward = unsafe { webview.canGoForward() };
    });
  });
}
pub async fn install_monitor(
  manager: WebTabs,
  window: TrustedWindow,
  id: String,
  view: &Webview,
  _focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<Option<usize>> {
  use objc2::{ClassType, rc::Retained};
  use objc2_app_kit::{NSEvent, NSEventMask, NSView};
  use objc2_foundation::NSObjectProtocol;
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_webview(move |platform| {
    let webview_pointer = platform.inner() as usize;
    let window_pointer = platform.ns_window() as usize;
    let callback = block2::RcBlock::new(move |event: std::ptr::NonNull<NSEvent>| -> *mut NSEvent {
      let pointer = event.as_ptr();
      let Some(mtm) = objc2::MainThreadMarker::new() else {
        return pointer;
      };
      let value = unsafe { event.as_ref() };
      if value.isARepeat() {
        return pointer;
      }
      let Some(native_window) = value.window(mtm) else {
        return pointer;
      };
      if &*native_window as *const _ as usize != window_pointer {
        return pointer;
      }
      let Some(responder) = native_window.firstResponder() else {
        return pointer;
      };
      if !responder.isKindOfClass(NSView::class()) {
        return pointer;
      }
      let focused = unsafe { &*(&*responder as *const _ as *const NSView) };
      let webview = unsafe { &*(webview_pointer as *const NSView) };
      if !focused.isDescendantOf(webview) {
        return pointer;
      }
      let Some(key) = value.charactersIgnoringModifiers() else {
        return pointer;
      };
      let key = key.to_string().to_lowercase();
      let flags = value.modifierFlags().0;
      let modifiers = shortcuts::Modifiers {
        alt: flags & (1 << 19) != 0,
        control: flags & (1 << 18) != 0,
        meta: flags & (1 << 20) != 0,
        shift: flags & (1 << 17) != 0,
      };
      if manager.shortcut(&window, &id, &shortcuts::normalize_key(&key), modifiers) {
        std::ptr::null_mut()
      } else {
        pointer
      }
    });
    // The retained monitor is consumed exactly once by remove_monitor on this same UI thread.
    let token = unsafe {
      NSEvent::addLocalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &callback)
    }
    .map(|token| Retained::into_raw(token) as usize);
    let _ = sender.send(token);
  })?;
  receiver
    .await
    .map_err(|_| failure("Native shortcut installation was cancelled"))
}
pub fn remove_monitor(view: &Webview, token: Option<usize>) {
  if let Some(token) = token {
    let _ = view.with_webview(move |_| {
      use objc2::rc::Retained;
      use objc2::runtime::AnyObject;
      use objc2_app_kit::NSEvent;
      if let Some(token) = unsafe { Retained::<AnyObject>::from_raw(token as *mut AnyObject) } {
        unsafe {
          NSEvent::removeMonitor(&token);
        }
      }
    });
  }
}

pub async fn focused(
  view: &Webview,
  _focused: std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<bool> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_webview(move |platform| {
    use objc2::ClassType;
    use objc2_app_kit::NSView;
    use objc2_foundation::NSObjectProtocol;
    let webview = unsafe { &*(platform.inner() as *const NSView) };
    let focused = webview
      .window()
      .filter(|window| window.isKeyWindow())
      .and_then(|window| window.firstResponder())
      .is_some_and(|responder| {
        if !responder.isKindOfClass(NSView::class()) {
          return false;
        }
        let focused = unsafe { &*(&*responder as *const _ as *const NSView) };
        focused.isDescendantOf(webview)
      });
    let _ = sender.send(focused);
  })?;
  receiver
    .await
    .map_err(|_| failure("Native web tab focus query was cancelled"))
}
