use crate::{
  error::{BackendError, BackendResult},
  native_window::TrustedWindow,
  workspace::WorkspaceRegistry,
};
use serde::{Deserialize, Serialize};
use tauri::State;

const SERVICE: &str = "app.marklab.tauri.git";
#[derive(Deserialize, Serialize)]
struct Credential {
  username: String,
  token: String,
}

fn origin(value: &str) -> BackendResult<String> {
  let url = url::Url::parse(value)
    .map_err(|_| BackendError::new("INVALID_REMOTE", "Enter an HTTPS repository URL"))?;
  if url.scheme() != "https"
    || url.host_str().is_none()
    || !url.username().is_empty()
    || url.password().is_some()
  {
    return Err(BackendError::new(
      "INVALID_REMOTE",
      "Git credentials require an HTTPS URL without embedded credentials",
    ));
  }
  Ok(url.origin().ascii_serialization())
}

fn entry(origin: &str) -> BackendResult<keyring::Entry> {
  keyring::Entry::new(SERVICE, origin).map_err(|_| {
    BackendError::new(
      "CREDENTIAL_STORE_UNAVAILABLE",
      "The system credential store is unavailable",
    )
  })
}

/// Called only inside a bounded Git worker. Never invokes Git credential helpers.
pub fn lookup(
  url: &str,
  provided_username: Option<&str>,
) -> BackendResult<Option<(String, String)>> {
  let value = match entry(&origin(url)?)?.get_password() {
    Ok(value) => value,
    Err(keyring::Error::NoEntry) => return Ok(None),
    Err(_) => {
      return Err(BackendError::new(
        "CREDENTIAL_STORE_UNAVAILABLE",
        "Git credentials could not be read from the system credential store",
      ));
    }
  };
  let credential: Credential = serde_json::from_str(&value).map_err(|_| {
    BackendError::new(
      "INVALID_CREDENTIAL",
      "Stored Git credentials must be entered again",
    )
  })?;
  if provided_username.is_some_and(|username| username != credential.username) {
    return Ok(None);
  }
  Ok(Some((credential.username, credential.token)))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SaveRequest {
  url: String,
  username: String,
  token: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RemoveRequest {
  url: String,
}
#[derive(Serialize)]
pub struct CredentialResult {
  ok: bool,
}

#[tauri::command]
pub async fn git_credentials_save(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  request: SaveRequest,
) -> BackendResult<CredentialResult> {
  registry.get(window.label())?.ensure_active()?;
  let origin = origin(&request.url)?;
  if request.username.trim().is_empty()
    || request.username.len() > 256
    || request.username.chars().any(char::is_control)
    || request.token.trim().is_empty()
    || request.token.len() > 16384
    || request.token.chars().any(char::is_control)
  {
    return Err(BackendError::new(
      "INVALID_CREDENTIAL",
      "Enter a username and access token",
    ));
  }
  crate::blocking::run(move || {
    let credential = Credential {
      username: request.username.trim().into(),
      token: request.token.trim().into(),
    };
    entry(&origin)?
      .set_password(&serde_json::to_string(&credential)?)
      .map_err(|_| {
        BackendError::new(
          "CREDENTIAL_STORE_UNAVAILABLE",
          "Git credentials could not be saved to the system credential store",
        )
      })?;
    Ok(CredentialResult { ok: true })
  })
  .await
}

#[tauri::command]
pub async fn git_credentials_remove(
  window: TrustedWindow,
  registry: State<'_, WorkspaceRegistry>,
  request: RemoveRequest,
) -> BackendResult<CredentialResult> {
  registry.get(window.label())?.ensure_active()?;
  let origin = origin(&request.url)?;
  crate::blocking::run(move || match entry(&origin)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(CredentialResult { ok: true }),
    Err(_) => Err(BackendError::new(
      "CREDENTIAL_STORE_UNAVAILABLE",
      "Git credentials could not be removed from the system credential store",
    )),
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn credentials_are_scoped_to_https_origin_without_passwords_or_repository_paths() {
    assert_eq!(
      origin("https://github.com/team/repo.git").unwrap(),
      "https://github.com"
    );
    assert_eq!(
      origin("https://example.com:8443/repo").unwrap(),
      "https://example.com:8443"
    );
    for url in [
      "http://example.com/repo",
      "https://user:token@example.com/repo",
      "file:///repo",
      "git@example.com:repo",
    ] {
      assert!(origin(url).is_err());
    }
  }
}
