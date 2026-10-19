use super::{Profile, ProfileInput, SyncService, paths};
use crate::{
  ai::secrets::{self, SecretUpdate},
  error::{BackendError, BackendResult},
};
use sqlx::Row;
impl SyncService {
  pub(crate) async fn stored_profile(&self, id: &str) -> BackendResult<(Profile, Option<String>)> {
    paths::identifier(id, 128)?;
    let row = sqlx::query("SELECT value_json,secret_ref FROM webdav_profiles WHERE id=?")
      .bind(id)
      .fetch_optional(&self.inner.pool)
      .await?
      .ok_or_else(|| {
        BackendError::new("WEBDAV_PROFILE_NOT_FOUND", "WebDAV profile was not found")
      })?;
    Ok((
      serde_json::from_str(row.get("value_json"))?,
      row.get("secret_ref"),
    ))
  }
  pub async fn list_profiles(&self) -> BackendResult<Vec<Profile>> {
    let ids: Vec<String> = sqlx::query_scalar(
      "SELECT id FROM webdav_profiles ORDER BY json_extract(value_json,'$.label'),id",
    )
    .fetch_all(&self.inner.pool)
    .await?;
    let mut profiles = Vec::with_capacity(ids.len());
    for id in ids {
      let (mut profile, reference) = self.stored_profile(&id).await?;
      profile.has_password = if profile.session_only {
        self.inner.sessions.lock().await.contains_key(&id)
      } else {
        reference.is_some()
      };
      profiles.push(profile);
    }
    Ok(profiles)
  }
  pub async fn update_profile(&self, mut input: ProfileInput) -> BackendResult<Profile> {
    paths::identifier(&input.id, 128)?;
    input.label = input.label.trim().into();
    input.username = input.username.trim().into();
    if input.label.is_empty()
      || input.label.chars().count() > 200
      || input.username.is_empty()
      || input.username.chars().count() > 512
    {
      return Err(paths::invalid("Invalid WebDAV profile metadata"));
    }
    if let SecretUpdate::Set(password) = &input.password
      && (password.is_empty() || password.len() > 8192)
    {
      return Err(paths::invalid("Invalid WebDAV password"));
    }
    let (endpoint, base_path) = paths::validate_endpoint(
      &input.endpoint,
      input.allow_insecure_local,
      input.base_path.as_deref(),
    )?;
    let _configuration = self.inner.configuration.write().await;
    let current = match self.stored_profile(&input.id).await {
      Ok(value) => Some(value),
      Err(error) if error.code == "WEBDAV_PROFILE_NOT_FOUND" => None,
      Err(error) => return Err(error),
    };
    let old_reference = current
      .as_ref()
      .and_then(|(_, reference)| reference.clone());
    let old_session = self.inner.sessions.lock().await.get(&input.id).cloned();
    let mut new_reference = old_reference.clone();
    let mut new_session = old_session.clone();
    let mut created = None;
    match input.password {
      SecretUpdate::Clear => {
        new_reference = None;
        new_session = None;
      }
      SecretUpdate::Set(password) => {
        if input.session_only {
          new_session = Some(password);
          new_reference = None;
        } else {
          let reference = secrets::create("webdav", password).await?;
          created = Some(reference.clone());
          new_reference = Some(reference);
          new_session = None;
        }
      }
      SecretUpdate::Unchanged => {
        if input.session_only {
          if let Some(reference) = &old_reference {
            new_session = Some(secrets::read(reference).await?);
          }
          new_reference = None;
        } else if current
          .as_ref()
          .is_some_and(|(profile, _)| profile.session_only)
        {
          new_reference = match old_session {
            Some(password) => {
              let reference = secrets::create("webdav", password).await?;
              created = Some(reference.clone());
              Some(reference)
            }
            None => None,
          };
          new_session = None;
        }
      }
    }
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let profile = Profile {
      id: input.id,
      label: input.label,
      endpoint,
      base_path,
      username: input.username,
      allow_insecure_local: input.allow_insecure_local,
      session_only: input.session_only,
      has_password: if input.session_only {
        new_session.is_some()
      } else {
        new_reference.is_some()
      },
      created_at: current
        .map(|(profile, _)| profile.created_at)
        .unwrap_or_else(|| now.clone()),
      updated_at: now,
    };
    let saved=sqlx::query("INSERT INTO webdav_profiles(id,value_json,secret_ref) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json,secret_ref=excluded.secret_ref").bind(&profile.id).bind(serde_json::to_string(&profile)?).bind(&new_reference).execute(&self.inner.pool).await;
    if let Err(error) = saved {
      if let Some(reference) = created {
        let _ = secrets::delete(&reference).await;
      }
      return Err(error.into());
    }
    let mut sessions = self.inner.sessions.lock().await;
    match new_session {
      Some(password) => {
        sessions.insert(profile.id.clone(), password);
      }
      None => {
        sessions.remove(&profile.id);
      }
    }
    drop(sessions);
    if old_reference != new_reference
      && let Some(reference) = old_reference
      && let Err(error) = secrets::delete(&reference).await
    {
      log::warn!(
        "Superseded WebDAV credential cleanup failed: {}",
        error.code
      );
    }
    Ok(profile)
  }
  pub async fn delete_profile(&self, id: &str) -> BackendResult<()> {
    paths::identifier(id, 128)?;
    let _configuration = self.inner.configuration.write().await;
    let bound: i64 = sqlx::query_scalar(
      "SELECT COUNT(*) FROM sync_channels WHERE json_extract(value_json,'$.profileId')=?",
    )
    .bind(id)
    .fetch_one(&self.inner.pool)
    .await?;
    if bound > 0 {
      return Err(BackendError::new(
        "WEBDAV_PROFILE_BOUND",
        "WebDAV profile is still bound to a workspace",
      ));
    }
    let current = match self.stored_profile(id).await {
      Ok(value) => value,
      Err(error) if error.code == "WEBDAV_PROFILE_NOT_FOUND" => return Ok(()),
      Err(error) => return Err(error),
    };
    if let Some(reference) = current.1 {
      secrets::delete(&reference).await?;
    }
    sqlx::query("DELETE FROM webdav_profiles WHERE id=?")
      .bind(id)
      .execute(&self.inner.pool)
      .await?;
    self.inner.sessions.lock().await.remove(id);
    Ok(())
  }
  pub async fn test_profile(&self, id: &str) -> BackendResult<()> {
    let channel = super::Channel {
      provider: "webdav".into(),
      profile_id: id.into(),
      remote_root: "/".into(),
      auto_sync: false,
    };
    self.remote(&channel).await?.stat("").await?;
    Ok(())
  }
}
