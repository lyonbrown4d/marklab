use crate::error::{BackendError, BackendResult};
use serde::{Deserialize, Deserializer};

#[derive(Default)]
pub enum SecretUpdate {
  #[default]
  Unchanged,
  Clear,
  Set(String),
}
impl<'de> Deserialize<'de> for SecretUpdate {
  fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
    Ok(match Option::<String>::deserialize(deserializer)? {
      Some(value) => Self::Set(value),
      None => Self::Clear,
    })
  }
}
const SERVICE: &str = "app.marklab.tauri.desktop";
fn unavailable() -> BackendError {
  BackendError::new(
    "CREDENTIAL_UNAVAILABLE",
    "The operating system credential store is unavailable; credentials were not saved",
  )
}
pub async fn create(namespace: &str, value: String) -> BackendResult<String> {
  let reference = format!("{namespace}:{}", uuid::Uuid::new_v4());
  let owned = reference.clone();
  tokio::task::spawn_blocking(move || {
    keyring::Entry::new(SERVICE, &owned)
      .map_err(|_| unavailable())?
      .set_password(&value)
      .map_err(|_| unavailable())
  })
  .await
  .map_err(|_| unavailable())??;
  Ok(reference)
}
pub async fn read(reference: &str) -> BackendResult<String> {
  let owned = reference.to_string();
  tokio::task::spawn_blocking(move || {
    keyring::Entry::new(SERVICE, &owned)
      .map_err(|_| unavailable())?
      .get_password()
      .map_err(|_| unavailable())
  })
  .await
  .map_err(|_| unavailable())?
}
pub async fn delete(reference: &str) -> BackendResult<()> {
  let owned = reference.to_string();
  tokio::task::spawn_blocking(move || {
    match keyring::Entry::new(SERVICE, &owned)
      .map_err(|_| unavailable())?
      .delete_credential()
    {
      Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
      Err(_) => Err(unavailable()),
    }
  })
  .await
  .map_err(|_| unavailable())?
}
