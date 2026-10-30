#[cfg(target_os = "macos")]
use tauri::Manager;
/// Align AppKit controls and keep GTK's native menu out of custom window chrome.
pub(super) fn align(window: &tauri::Window) {
  #[cfg(target_os = "linux")]
  if let Err(error) = window.hide_menu() {
    log::warn!("Could not hide the native menu: {error}");
  }
  #[cfg(target_os = "macos")]
  {
    if window.label() == "splash" || window.label().starts_with("opening-") {
      return;
    }
    let owner = window.clone();
    if let Err(error) = window.run_on_main_thread(move || {
      if let Ok(pointer) = owner.ns_window() {
        // SAFETY: Tauri owns this NSWindow; the closure runs on its UI thread
        // and the retained Window handle keeps its runtime alive.
        let native = unsafe { &*(pointer as *const objc2_app_kit::NSWindow) };
        align_native(native);
      }
    }) {
      log::warn!("Could not schedule native titlebar alignment: {error}");
    }
  }
  #[cfg(not(any(target_os = "macos", target_os = "linux")))]
  let _ = window;
}

#[cfg(target_os = "macos")]
fn align_native(window: &objc2_app_kit::NSWindow) {
  use objc2_app_kit::{NSWindowButton, NSWindowStyleMask};
  use objc2_foundation::NSPoint;

  // Fullscreen uses the system's auto-hiding titlebar, outside the web header.
  if window.styleMask().contains(NSWindowStyleMask::FullScreen) {
    return;
  }
  let Some(close) = window.standardWindowButton(NSWindowButton::CloseButton) else {
    return;
  };
  // SAFETY: All hierarchy reads and retained views stay on AppKit's UI thread.
  let Some(parent) = (unsafe { close.superview() }) else {
    return;
  };
  let Some(container) = (unsafe { parent.superview() }) else {
    return;
  };
  let mut frame = container.frame();
  frame.size.height = 52.0;
  frame.origin.y = window.frame().size.height - frame.size.height;
  container.setFrame(frame);

  // Convert from window coordinates so AppKit button sizes, view orientation
  // and backing scale never enter a hard-coded inset formula.
  let center_y = window.frame().size.height - 25.5;
  let spacing = window
    .standardWindowButton(NSWindowButton::MiniaturizeButton)
    .map(|button| button.frame().origin.x - close.frame().origin.x)
    .unwrap_or(20.0);
  for (index, kind) in [
    NSWindowButton::CloseButton,
    NSWindowButton::MiniaturizeButton,
    NSWindowButton::ZoomButton,
  ]
  .into_iter()
  .enumerate()
  {
    let Some(button) = window.standardWindowButton(kind) else {
      continue;
    };
    let Some(parent) = (unsafe { button.superview() }) else {
      continue;
    };
    let frame = button.frame();
    let center = parent.convertPoint_fromView(
      NSPoint::new(
        16.0 + index as f64 * spacing + frame.size.width / 2.0,
        center_y,
      ),
      None,
    );
    button.setFrameOrigin(NSPoint::new(
      center.x - frame.size.width / 2.0,
      center.y - frame.size.height / 2.0,
    ));
  }
}
