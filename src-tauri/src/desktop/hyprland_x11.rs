//! Explicit EWMH state on the exact owner when GTK's tiled state suppresses requests.
use crate::error::BackendResult;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use tauri::Manager;
use x11rb::{
  connection::Connection,
  protocol::xproto::{ClientMessageEvent, ConnectionExt, EventMask},
};

pub(super) async fn maximize(window: &tauri::WebviewWindow, maximized: bool) -> BackendResult<()> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  let owner = window.clone();
  window.run_on_main_thread(move || {
    let xid = owner
      .window_handle()
      .ok()
      .and_then(|handle| match handle.as_raw() {
        RawWindowHandle::Xlib(handle) => u32::try_from(handle.window).ok(),
        RawWindowHandle::Xcb(handle) => Some(handle.window.get()),
        _ => None,
      });
    let _ = sender.send(xid);
  })?;
  let xid = receiver
    .await
    .map_err(|_| super::hyprland_ipc::failure("The owner window is unavailable"))?
    .filter(|xid| *xid != 0)
    .ok_or_else(|| super::hyprland_ipc::failure("The owner has no X11 window"))?;
  crate::blocking::run(move || {
    let execute = || -> Result<(), Box<dyn std::error::Error>> {
      let (connection, screen) = x11rb::connect(None)?;
      let state = connection
        .intern_atom(false, b"_NET_WM_STATE")?
        .reply()?
        .atom;
      let vertical = connection
        .intern_atom(false, b"_NET_WM_STATE_MAXIMIZED_VERT")?
        .reply()?
        .atom;
      let horizontal = connection
        .intern_atom(false, b"_NET_WM_STATE_MAXIMIZED_HORZ")?
        .reply()?
        .atom;
      let event = ClientMessageEvent::new(
        32,
        xid,
        state,
        [u32::from(maximized), vertical, horizontal, 1, 0],
      );
      connection
        .send_event(
          false,
          connection.setup().roots[screen].root,
          EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
          event,
        )?
        .check()?;
      connection.flush()?;
      Ok(())
    };
    execute().map_err(|_| super::hyprland_ipc::failure("Cannot request the owner window state"))
  })
  .await
}
