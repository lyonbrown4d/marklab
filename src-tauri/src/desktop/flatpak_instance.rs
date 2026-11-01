//! Forward activation before CEF opens the primary instance's locked profile.
use crate::error::{BackendError, BackendResult};
use std::time::Duration;

pub(super) fn active() -> bool {
  std::path::Path::new("/.flatpak-info").is_file()
}

pub(super) fn identifier(application: &str) -> String {
  format!("{application}.Flatpak")
}

pub(super) async fn forward_existing(application: &str) -> BackendResult<bool> {
  if !active() {
    return Ok(false);
  }
  let forward = async {
    let connection = zbus::Connection::session().await?;
    let service = format!("{}.SingleInstance", identifier(application));
    let bus = zbus::fdo::DBusProxy::new(&connection).await?;
    if !bus.name_has_owner(service.as_str().try_into()?).await? {
      return Ok::<_, zbus::Error>(false);
    }
    // Match tauri-plugin-single-instance's existing, typed wire contract.
    let path = format!("/{}", service.replace('.', "/").replace('-', "_"));
    let args: Vec<String> = std::env::args_os()
      .map(|value| value.to_string_lossy().into_owned())
      .collect();
    let cwd = std::env::current_dir()
      .map_err(zbus::Error::from)?
      .to_string_lossy()
      .into_owned();
    connection
      .call_method(
        Some(service.as_str()),
        path.as_str(),
        Some("org.SingleInstance.DBus"),
        "ExecuteCallback",
        &(args, cwd),
      )
      .await?;
    Ok(true)
  };
  tokio::time::timeout(Duration::from_secs(3), forward)
    .await
    .map_err(|_| {
      BackendError::new(
        "WINDOW_ACTIVATION_TIMEOUT",
        "The existing Flatpak instance did not respond",
      )
    })?
    .map_err(|_| {
      BackendError::new(
        "WINDOW_ACTIVATION_FAILED",
        "Cannot contact the Flatpak application instance",
      )
    })
}
