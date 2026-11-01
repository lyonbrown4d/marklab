//! GTK reports tiled Hyprland windows as maximized. Read the compositor's real
//! state, but keep every mutation on the exact Tauri/GTK owner window.
use super::hyprland_ipc::{self as ipc, Query};
use crate::error::BackendResult;
use serde::Deserialize;
use std::{collections::HashMap, path::PathBuf, sync::Mutex, time::Duration};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Clone, Debug, Deserialize)]
pub(super) struct Client {
  pub address: String,
  pub pid: i64,
  #[serde(default)]
  pub title: String,
  #[serde(default)]
  pub size: [u32; 2],
  pub fullscreen: u8,
  #[serde(default = "mapped")]
  pub mapped: bool,
  #[serde(default, rename = "stableId")]
  pub stable_id: String,
}
fn mapped() -> bool {
  true
}

#[derive(Clone)]
struct Identity {
  address: String,
  stable_id: String,
  fullscreen: u8,
}
#[derive(Default)]
pub struct HyprlandWindows {
  socket: Option<PathBuf>,
  owners: Mutex<WindowOwners>,
  operation: AsyncMutex<()>,
}
struct WindowOwners {
  pid: i64,
  windows: HashMap<String, Identity>,
  hidden: Vec<String>,
}
impl Default for WindowOwners {
  fn default() -> Self {
    Self {
      pid: i64::from(std::process::id()),
      windows: HashMap::new(),
      hidden: Vec::new(),
    }
  }
}
impl HyprlandWindows {
  pub(super) fn remember_hidden(&self, label: &str) -> BackendResult<()> {
    let mut owners = self
      .owners
      .lock()
      .map_err(|_| ipc::failure("Window ownership is unavailable"))?;
    owners.hidden.retain(|value| value != label);
    owners.hidden.push(label.into());
    Ok(())
  }
  pub(super) fn activation_target(
    &self,
    app: &tauri::AppHandle,
  ) -> Option<crate::native_window::TrustedWindow> {
    if !self.is_flatpak_hyprland() {
      return None;
    }
    let labels = self.owners.lock().ok()?.hidden.clone();
    labels.into_iter().rev().find_map(|label| {
      crate::native_window::get(app, &label)
        .filter(|window| window.is_visible().is_ok_and(|visible| !visible))
    })
  }
  pub(super) fn is_flatpak_hyprland(&self) -> bool {
    self.socket.is_some() && std::path::Path::new("/.flatpak-info").is_file()
  }
  pub fn detect() -> BackendResult<Self> {
    let socket = ipc::socket_path();
    let pid = if socket.is_some() {
      super::hyprland_process::pid()?
    } else {
      i64::from(std::process::id())
    };
    Ok(Self {
      socket,
      owners: Mutex::new(WindowOwners {
        pid,
        windows: HashMap::new(),
        hidden: Vec::new(),
      }),
      ..Self::default()
    })
  }
  pub fn forget(&self, label: &str) {
    if let Ok(mut owners) = self.owners.lock() {
      owners.windows.remove(label);
      owners.hidden.retain(|value| value != label);
    }
  }
  pub async fn get(&self, window: &tauri::WebviewWindow) -> BackendResult<Option<bool>> {
    let _operation = self.operation.lock().await;
    // Close/quit hides the owner before saving its geometry. GTK still reports
    // tiled windows as maximized then, so retain the last compositor observation.
    if self.socket.is_some() && !window.is_visible()? {
      return Ok(
        self
          .owners
          .lock()
          .map_err(|_| ipc::failure("Window ownership is unavailable"))?
          .windows
          .get(window.label())
          .and_then(|identity| fullscreen_maximized(identity.fullscreen)),
      );
    }
    Ok(
      self
        .current(window)
        .await?
        .and_then(|client| maximized(&client)),
    )
  }
  pub async fn set(&self, window: &tauri::WebviewWindow, desired: bool) -> BackendResult<bool> {
    let _operation = self.operation.lock().await;
    let Some(client) = self.current(window).await? else {
      return Ok(false);
    };
    let Some(current) = maximized(&client) else {
      return Ok(false);
    };
    if current == desired {
      return Ok(true);
    }
    if self.is_flatpak_hyprland() {
      super::hyprland_x11::maximize(window, desired).await?;
    } else if desired {
      window.maximize()?;
    } else {
      window.unmaximize()?;
    }
    let Some(path) = &self.socket else {
      return Ok(false);
    };
    // GTK requests are asynchronous. Wait for this one acknowledgement while
    // serializing callers so retries cannot toggle Hyprland's state twice.
    // No timer or polling remains after this bounded user operation.
    let deadline = tokio::time::Instant::now() + Duration::from_secs(1);
    while tokio::time::Instant::now() < deadline {
      tokio::time::sleep(Duration::from_millis(25)).await;
      let clients: Vec<Client> = ipc::read(path, Query::Clients).await?;
      let current = clients.iter().find(|item| same_window(item, &client));
      match current {
        Some(current) if maximized(current) == Some(desired) => {
          if let Some(identity) = self
            .owners
            .lock()
            .map_err(|_| ipc::failure("Window ownership is unavailable"))?
            .windows
            .get_mut(window.label())
          {
            identity.fullscreen = current.fullscreen;
          }
          return Ok(true);
        }
        Some(_) => {}
        None => return Err(ipc::failure("The window closed before its state changed")),
      }
    }
    Err(ipc::failure(
      "The compositor did not acknowledge the requested window state",
    ))
  }
  async fn current(&self, window: &tauri::WebviewWindow) -> BackendResult<Option<Client>> {
    let Some(path) = &self.socket else {
      return Ok(None);
    };
    if !window.is_visible()? {
      return Ok(None);
    }
    let title = window.title()?;
    let size = window.inner_size()?;
    let clients: Vec<Client> = ipc::read(path, Query::Clients).await?;
    let focused = window.is_focused()?;
    let active: Option<Client> = if focused {
      let value: serde_json::Value = ipc::read(path, Query::ActiveWindow).await?;
      serde_json::from_value(value).ok()
    } else {
      None
    };
    if !window.is_visible()? {
      return Err(ipc::failure("The window is no longer visible"));
    }
    let mut owners = self
      .owners
      .lock()
      .map_err(|_| ipc::failure("Window ownership is unavailable"))?;
    resolve(
      &mut owners,
      &clients,
      window.label(),
      &title,
      [size.width, size.height],
      active.as_ref(),
      focused,
    )
    .map(Some)
  }
}

fn maximized(client: &Client) -> Option<bool> {
  fullscreen_maximized(client.fullscreen)
}
fn fullscreen_maximized(fullscreen: u8) -> Option<bool> {
  // Native fullscreen keeps its existing GTK behavior and restore preference.
  (fullscreen != 2).then_some(fullscreen == 1)
}
fn owned(client: &Client, pid: i64) -> bool {
  client.mapped && client.pid == pid
}
fn same_window(left: &Client, right: &Client) -> bool {
  left.mapped
    && right.mapped
    && left.pid == right.pid
    && left.address == right.address
    && left.stable_id == right.stable_id
}
fn resolve(
  owners: &mut WindowOwners,
  clients: &[Client],
  label: &str,
  title: &str,
  size: [u32; 2],
  active: Option<&Client>,
  focused: bool,
) -> BackendResult<Client> {
  let pid = owners.pid;
  let owners = &mut owners.windows;
  owners.retain(|_, identity| {
    clients.iter().any(|client| {
      owned(client, pid)
        && client.address == identity.address
        && client.stable_id == identity.stable_id
    })
  });
  if let Some(identity) = owners.get_mut(label)
    && let Some(client) = clients.iter().find(|client| {
      owned(client, pid)
        && client.address == identity.address
        && client.stable_id == identity.stable_id
    })
  {
    identity.fullscreen = client.fullscreen;
    return Ok(client.clone());
  }
  let candidates: Vec<_> = clients
    .iter()
    .filter(|client| {
      owned(client, pid)
        && client.title == title
        && client.size == size
        && !owners
          .values()
          .any(|identity| identity.address == client.address)
    })
    .collect();
  let available: Vec<_> = clients
    .iter()
    .filter(|client| {
      owned(client, pid)
        && client.title == title
        && !owners
          .values()
          .any(|identity| identity.address == client.address)
    })
    .collect();
  let selected = if candidates.len() == 1 {
    candidates.first().copied()
  } else if available.len() == 1 {
    available.first().copied()
  } else {
    active.filter(|active| focused && available.iter().any(|client| same_window(client, active)))
  }
  .ok_or_else(|| ipc::failure("Cannot identify the requesting application window unambiguously"))?;
  owners.insert(
    label.into(),
    Identity {
      address: selected.address.clone(),
      stable_id: selected.stable_id.clone(),
      fullscreen: selected.fullscreen,
    },
  );
  Ok(selected.clone())
}

#[cfg(test)]
#[path = "hyprland_windows_tests.rs"]
mod tests;
