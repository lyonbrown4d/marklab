//! Read-only Hyprland IPC. No shell, dispatcher, or renderer-supplied messages.
use crate::error::{BackendError, BackendResult};
use std::{path::PathBuf, time::Duration};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub(super) fn socket_path() -> Option<PathBuf> {
  let desktop = std::env::var("XDG_CURRENT_DESKTOP").ok()?;
  let runtime = PathBuf::from(std::env::var_os("XDG_RUNTIME_DIR")?);
  let signature = std::env::var("HYPRLAND_INSTANCE_SIGNATURE").ok()?;
  socket_path_for(&desktop, &runtime, &signature)
}

fn socket_path_for(desktop: &str, runtime: &std::path::Path, signature: &str) -> Option<PathBuf> {
  if !desktop
    .split(':')
    .any(|value| value.eq_ignore_ascii_case("Hyprland"))
    || !runtime.is_absolute()
    || signature.is_empty()
    || signature.len() > 256
    || [".", ".."].contains(&signature)
    || !signature
      .bytes()
      .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
  {
    return None;
  }
  Some(runtime.join("hypr").join(signature).join(".socket.sock"))
}

pub(super) enum Query {
  Clients,
  ActiveWindow,
}

pub(super) async fn read<T: serde::de::DeserializeOwned>(
  path: &std::path::Path,
  query: Query,
) -> BackendResult<T> {
  let message = match query {
    Query::Clients => "j/clients",
    Query::ActiveWindow => "j/activewindow",
  };
  let bytes = tokio::time::timeout(Duration::from_millis(500), async {
    let mut stream = tokio::net::UnixStream::connect(path).await?;
    stream.write_all(message.as_bytes()).await?;
    stream.shutdown().await?;
    let mut bytes = Vec::new();
    stream.take(1024 * 1024 + 1).read_to_end(&mut bytes).await?;
    Ok::<_, std::io::Error>(bytes)
  })
  .await
  .map_err(|_| failure("The compositor did not respond in time"))?
  .map_err(|_| failure("The compositor connection is unavailable"))?;
  if bytes.len() > 1024 * 1024 {
    return Err(failure("The compositor response exceeds its size limit"));
  }
  serde_json::from_slice(&bytes)
    .map_err(|_| failure("The compositor returned an invalid window state"))
}

pub(super) fn failure(message: &str) -> BackendError {
  BackendError::new("WINDOW_COMPOSITOR_UNAVAILABLE", message)
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn only_hyprland_with_valid_session_metadata_enables_the_adapter() {
    let runtime = std::path::Path::new("/run/user/1000");
    for desktop in ["GNOME", "KDE", "X-Cinnamon", "notHyprland", ""] {
      assert!(socket_path_for(desktop, runtime, "test_123").is_none());
    }
    for desktop in ["Hyprland", "HYPRLAND", "Hyprland:wlroots"] {
      assert_eq!(
        socket_path_for(desktop, runtime, "test_123"),
        Some(runtime.join("hypr/test_123/.socket.sock"))
      );
    }
    for signature in ["", ".", "..", "../../other", "bad/session"] {
      assert!(socket_path_for("Hyprland", runtime, signature).is_none());
    }
    assert!(socket_path_for("Hyprland", std::path::Path::new("relative"), "test_123").is_none());
  }
}
