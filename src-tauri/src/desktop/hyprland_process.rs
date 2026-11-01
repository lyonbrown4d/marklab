//! Resolve our own X11 connection's server-side PID across Flatpak namespaces.
use crate::error::BackendResult;
use x11rb::{
  connection::Connection,
  protocol::res::{ClientIdMask, ClientIdSpec, ConnectionExt},
};

pub(super) fn pid() -> BackendResult<i64> {
  if !std::path::Path::new("/.flatpak-info").is_file() {
    return Ok(i64::from(std::process::id()));
  }
  // XRes uses the peer credentials of this connection, exactly as Hyprland
  // does for its clients. Never infer ownership from a title or focused window.
  let (connection, _) = x11rb::connect(None)
    .map_err(|_| super::hyprland_ipc::failure("Cannot identify our X11 connection"))?;
  let spec = ClientIdSpec {
    client: connection.setup().resource_id_base,
    mask: ClientIdMask::LOCAL_CLIENT_PID,
  };
  let response = connection
    .res_query_client_ids(&[spec])
    .map_err(|_| {
      super::hyprland_ipc::failure("The display does not support process identification")
    })?
    .reply()
    .map_err(|_| super::hyprland_ipc::failure("Cannot read our display process identity"))?;
  let id = response
    .ids
    .first()
    .filter(|id| {
      response.ids.len() == 1
        && id.spec.client == spec.client
        && id.spec.mask.contains(ClientIdMask::LOCAL_CLIENT_PID)
    })
    .and_then(|id| {
      id.value
        .first()
        .copied()
        .filter(|pid| id.value.len() == 1 && *pid > 0)
    })
    .ok_or_else(|| {
      super::hyprland_ipc::failure("The display returned an invalid process identity")
    })?;
  Ok(i64::from(id))
}
