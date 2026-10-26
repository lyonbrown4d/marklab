use super::*;
use std::{
  collections::HashMap,
  io::Write,
  os::unix::net::UnixStream,
  sync::{
    OnceLock,
    atomic::{AtomicUsize, Ordering},
    mpsc,
  },
};
use tauri_runtime_cef::{
  WebviewCefExt,
  cef::{ImplBrowser, ImplBrowserHost},
};
use x11rb::{
  connection::Connection, protocol::xproto::ConnectionExt, rust_connection::RustConnection,
};
#[path = "cef_linux_keys.rs"]
mod keys;
#[path = "cef_linux_monitor.rs"]
mod monitor;

struct Update {
  bindings: Vec<shortcuts::Shortcut>,
  reply: tokio::sync::oneshot::Sender<BackendResult<()>>,
}
struct Monitor {
  wake: Mutex<UnixStream>,
  sender: mpsc::Sender<Update>,
}
static MONITORS: OnceLock<Mutex<HashMap<usize, Arc<Monitor>>>> = OnceLock::new();
static NEXT_MONITOR: AtomicUsize = AtomicUsize::new(1);
fn monitors() -> &'static Mutex<HashMap<usize, Arc<Monitor>>> {
  MONITORS.get_or_init(Mutex::default)
}
fn bindings(manager: &WebTabs, owner: &str) -> BackendResult<Vec<shortcuts::Shortcut>> {
  Ok(
    manager
      .inner
      .owners
      .lock()
      .map_err(|_| failure("Web tab state is unavailable"))?
      .get(owner)
      .map(|owner| owner.bindings.clone())
      .unwrap_or_default(),
  )
}
impl Monitor {
  fn update(
    &self,
    bindings: Vec<shortcuts::Shortcut>,
  ) -> BackendResult<tokio::sync::oneshot::Receiver<BackendResult<()>>> {
    let (reply, receiver) = tokio::sync::oneshot::channel();
    self
      .sender
      .send(Update { bindings, reply })
      .map_err(|_| failure("Native shortcut monitor stopped"))?;
    self.wake()?;
    Ok(receiver)
  }
  fn wake(&self) -> BackendResult<()> {
    match self
      .wake
      .lock()
      .map_err(|_| failure("Native shortcut monitor is unavailable"))?
      .write(&[1])
    {
      Ok(_) => Ok(()),
      Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => Ok(()),
      Err(_) => Err(failure("Cannot wake native shortcut monitor")),
    }
  }
}
pub async fn bindings_changed(manager: &WebTabs, owner: &str) -> BackendResult<()> {
  let (bindings, tokens) = {
    let owners = manager
      .inner
      .owners
      .lock()
      .map_err(|_| failure("Web tab state is unavailable"))?;
    let Some(owner) = owners.get(owner) else {
      return Ok(());
    };
    (
      owner.bindings.clone(),
      owner
        .entries
        .values()
        .filter_map(|entry| entry.monitor)
        .collect::<Vec<_>>(),
    )
  };
  let handles = {
    let monitors = monitors()
      .lock()
      .map_err(|_| failure("Native shortcut monitors are unavailable"))?;
    tokens
      .iter()
      .map(|token| {
        monitors
          .get(token)
          .cloned()
          .ok_or_else(|| failure("Native shortcut monitor is unavailable"))
      })
      .collect::<BackendResult<Vec<_>>>()?
  };
  for handle in handles {
    tokio::time::timeout(
      std::time::Duration::from_secs(2),
      handle.update(bindings.clone())?,
    )
    .await
    .map_err(|_| failure("Native shortcut update timed out"))?
    .map_err(|_| failure("Native shortcut update was cancelled"))??;
  }
  Ok(())
}
pub async fn install_monitor(
  manager: WebTabs,
  window: TrustedWindow,
  id: String,
  view: &Webview,
  _focused: Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<Option<usize>> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_cef_webview(move |platform| {
    let xid = platform
      .browser()
      .host()
      .map(|host| host.window_handle())
      .unwrap_or_default();
    let _ = sender.send(u32::try_from(xid).ok().filter(|xid| *xid != 0));
  })?;
  let xid = receiver
    .await
    .map_err(|_| failure("Native shortcut installation was cancelled"))?
    .ok_or_else(|| failure("Native CEF shortcut window is unavailable"))?;
  let initial = bindings(&manager, window.label())?;
  let token = NEXT_MONITOR
    .try_update(Ordering::Relaxed, Ordering::Relaxed, |value| {
      value.checked_add(1)
    })
    .map_err(|_| failure("Native shortcut monitor identifiers are exhausted"))?;
  let (wake, read) =
    UnixStream::pair().map_err(|_| failure("Cannot create native shortcut wake channel"))?;
  wake
    .set_nonblocking(true)
    .map_err(|_| failure("Cannot configure native shortcut wake channel"))?;
  read
    .set_nonblocking(true)
    .map_err(|_| failure("Cannot configure native shortcut wake channel"))?;
  let (sender, updates) = mpsc::channel();
  let handle = Arc::new(Monitor {
    wake: Mutex::new(wake),
    sender,
  });
  let (ready, receiver) = tokio::sync::oneshot::channel();
  let weak = Arc::downgrade(&handle);
  std::thread::Builder::new()
    .name("web-tab-shortcuts".into())
    .spawn(move || {
      let result = monitor::run(xid, manager, window, id, initial, read, updates, ready);
      if let Err(error) = result {
        log::warn!("Native web tab shortcut monitor stopped: {error}");
      }
      if let Ok(mut registry) = monitors().lock()
        && registry
          .get(&token)
          .is_some_and(|value| weak.ptr_eq(&Arc::downgrade(value)))
      {
        registry.remove(&token);
      }
    })
    .map_err(|_| failure("Cannot start native shortcut monitor"))?;
  monitors()
    .lock()
    .map_err(|_| failure("Native shortcut monitors are unavailable"))?
    .insert(token, handle);
  let mut guard = InstallGuard {
    token: Some(token),
    view: view.clone(),
  };
  let result = tokio::time::timeout(std::time::Duration::from_secs(2), receiver).await;
  match result {
    Ok(Ok(Ok(()))) => {
      guard.token.take();
      Ok(Some(token))
    }
    result => match result {
      Ok(Ok(Err(error))) => Err(error),
      _ => Err(failure("Native shortcut installation did not complete")),
    },
  }
}
struct InstallGuard {
  token: Option<usize>,
  view: Webview,
}
impl Drop for InstallGuard {
  fn drop(&mut self) {
    remove_monitor(&self.view, self.token);
  }
}
pub fn remove_monitor(_view: &Webview, token: Option<usize>) {
  if let Some(token) = token
    && let Ok(mut monitors) = monitors().lock()
    && let Some(handle) = monitors.remove(&token)
  {
    // Closing this writer wakes poll with EOF; dropping the X11 connection releases every grab.
    drop(handle);
  }
}
pub(super) fn owns_focus(conn: &RustConnection, xid: u32) -> BackendResult<bool> {
  let mut focus = conn
    .get_input_focus()
    .map_err(|_| failure("Cannot query native keyboard focus"))?
    .reply()
    .map_err(|_| failure("Cannot query native keyboard focus"))?
    .focus;
  for _ in 0..128 {
    if focus == xid {
      return Ok(true);
    }
    if focus <= 1 {
      return Ok(false);
    }
    let tree = conn
      .query_tree(focus)
      .map_err(|_| failure("Cannot inspect native keyboard focus"))?
      .reply()
      .map_err(|_| failure("Cannot inspect native keyboard focus"))?;
    if tree.parent == focus {
      return Ok(false);
    }
    focus = tree.parent;
  }
  Err(failure("Native focus ancestry exceeds supported depth"))
}
pub async fn focused(
  view: &Webview,
  _focused: Arc<std::sync::atomic::AtomicBool>,
) -> BackendResult<bool> {
  let (sender, receiver) = tokio::sync::oneshot::channel();
  view.with_cef_webview(move |platform| {
    let xid = platform
      .browser()
      .host()
      .map(|host| host.window_handle())
      .unwrap_or_default();
    let _ = sender.send((
      u32::try_from(xid).ok().filter(|xid| *xid != 0),
      platform.snapshot().visible,
    ));
  })?;
  let (xid, visible) = receiver
    .await
    .map_err(|_| failure("Native focus query was cancelled"))?;
  if visible != Some(true) {
    return Ok(false);
  }
  let xid = xid.ok_or_else(|| failure("Native CEF focus window is unavailable"))?;
  crate::blocking::run(move || {
    let (conn, _) =
      x11rb::connect(None).map_err(|_| failure("Cannot connect to native display"))?;
    owns_focus(&conn, xid)
  })
  .await
}
