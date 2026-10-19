use std::sync::{
  Arc,
  atomic::{AtomicBool, Ordering},
};
pub fn callbacks(cancel: Option<Arc<AtomicBool>>) -> git2::RemoteCallbacks<'static> {
  let mut callbacks = git2::RemoteCallbacks::new();
  let deadline = std::time::Instant::now() + std::time::Duration::from_secs(180);
  callbacks.credentials(|url, provided, allowed| {
    if allowed.contains(git2::CredentialType::SSH_KEY) {
      return git2::Cred::ssh_key_from_agent(provided.unwrap_or("git"));
    }
    if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT) && url.starts_with("https://") {
      match crate::platform::git_credentials::lookup(url, provided) {
        Ok(Some((username, token))) => return git2::Cred::userpass_plaintext(&username, &token),
        _ => {
          return Err(git2::Error::new(
            git2::ErrorCode::Auth,
            git2::ErrorClass::Callback,
            "Git HTTPS authentication is required; add credentials in the Git remote settings",
          ));
        }
      }
    }
    if allowed.contains(git2::CredentialType::USERNAME) {
      return git2::Cred::username(provided.unwrap_or("git"));
    }
    Err(git2::Error::new(
      git2::ErrorCode::Auth,
      git2::ErrorClass::Callback,
      "Git authentication is required; configure HTTPS credentials or an SSH agent key",
    ))
  });
  let transfer_cancel = cancel.clone();
  callbacks.transfer_progress(move |_| {
    std::time::Instant::now() < deadline
      && !transfer_cancel
        .as_ref()
        .is_some_and(|v| v.load(Ordering::Acquire))
  });
  callbacks.push_transfer_progress(move |_, _, _| {});
  callbacks.push_update_reference(move |_, status| {
    if std::time::Instant::now() >= deadline
      || cancel.as_ref().is_some_and(|v| v.load(Ordering::Acquire))
    {
      return Err(git2::Error::from_str("Git operation was cancelled"));
    }
    if let Some(status) = status {
      return Err(git2::Error::from_str(status));
    }
    Ok(())
  });
  // libgit2 performs its normal certificate and SSH host verification; no override is installed.
  callbacks
}
