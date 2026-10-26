use super::{
  AiService, ProviderConfigurationSource, ProviderKind, ProviderMetadata, ProviderUpdate,
  PublicProvider, StoredProvider, environment, policy, secrets,
};
use crate::error::{BackendError, BackendResult};
use sqlx::types::Json;

#[derive(sqlx::FromRow)]
struct ProviderRow {
  metadata_json: Json<ProviderMetadata>,
  created_at: String,
  updated_at: String,
  secret_ref: Option<String>,
}
impl AiService {
  pub async fn stored_provider(&self, id: &str) -> BackendResult<StoredProvider> {
    policy::validate_id(id)?;
    if environment::reserved(id) {
      return self
        .inner
        .environment_providers
        .iter()
        .find(|provider| provider.metadata.metadata.id == id)
        .map(|provider| provider.metadata.clone())
        .ok_or_else(|| BackendError::new("AI_PROVIDER_NOT_FOUND", "AI provider was not found"));
    }
    let row = sqlx::query_as::<_, ProviderRow>(
      "SELECT metadata_json,created_at,updated_at,secret_ref FROM ai_providers WHERE id=?",
    )
    .bind(id)
    .fetch_optional(&self.inner.pool)
    .await
    .map_err(|error| {
      if let sqlx::Error::ColumnDecode { source, .. } = &error
        && let Some(error) = source.downcast_ref::<serde_json::Error>()
      {
        return BackendError::new("INVALID_REQUEST", error.to_string());
      }
      error.into()
    })?
    .ok_or_else(|| BackendError::new("AI_PROVIDER_NOT_FOUND", "AI provider was not found"))?;
    let provider = StoredProvider {
      metadata: row.metadata_json.0,
      created_at: row.created_at,
      updated_at: row.updated_at,
      secret_ref: row.secret_ref,
    };
    policy::validate_stored(&provider, id)?;
    Ok(provider)
  }
  pub async fn list_providers(&self) -> BackendResult<Vec<PublicProvider>> {
    let ids: Vec<String> = sqlx::query_scalar(
      "SELECT id FROM ai_providers ORDER BY json_extract(metadata_json,'$.label'),id",
    )
    .fetch_all(&self.inner.pool)
    .await?;
    let mut providers = Vec::with_capacity(ids.len());
    for id in ids {
      providers.push(self.public_provider(self.stored_provider(&id).await?));
    }
    for environment in &self.inner.environment_providers {
      if !providers
        .iter()
        .any(|provider| provider.metadata.kind == environment.metadata.metadata.kind)
      {
        providers.push(self.public_provider(environment.metadata.clone()));
      }
    }
    Ok(providers)
  }
  pub async fn get_provider(&self, id: &str) -> BackendResult<PublicProvider> {
    Ok(self.public_provider(self.stored_provider(id).await?))
  }
  fn public_provider(&self, provider: StoredProvider) -> PublicProvider {
    let virtual_provider = environment::reserved(&provider.metadata.id);
    let environment_available = self
      .inner
      .environment_providers
      .iter()
      .any(|environment| environment.metadata.metadata.kind == provider.metadata.kind);
    let mut public = policy::public(provider, environment_available);
    if virtual_provider {
      public.configuration_source = Some(ProviderConfigurationSource::Environment);
    }
    public
  }
  pub async fn update_provider(&self, mut input: ProviderUpdate) -> BackendResult<PublicProvider> {
    environment::ensure_mutable(&input.id)?;
    policy::normalize_update(&mut input)?;
    let _mutation = self.inner.mutation.lock().await;
    let current = match self.stored_provider(&input.id).await {
      Ok(provider) => Some(provider),
      Err(error) if error.code == "AI_PROVIDER_NOT_FOUND" => None,
      Err(error) => return Err(error),
    };
    let old = current
      .as_ref()
      .and_then(|provider| provider.secret_ref.clone());
    let created = match &input.api_key {
      secrets::SecretUpdate::Set(key) => Some(secrets::create("ai", key.clone()).await?),
      _ => None,
    };
    let reference = match input.api_key {
      secrets::SecretUpdate::Unchanged => old.clone(),
      secrets::SecretUpdate::Clear => None,
      secrets::SecretUpdate::Set(_) => created.clone(),
    };
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let provider = StoredProvider {
      metadata: ProviderMetadata {
        id: input.id,
        label: input.label,
        kind: input.kind,
        model: input.model,
        base_url: input.base_url,
      },
      created_at: current
        .map(|provider| provider.created_at)
        .unwrap_or_else(|| now.clone()),
      updated_at: now,
      secret_ref: reference.clone(),
    };
    let saved=sqlx::query("INSERT INTO ai_providers(id,metadata_json,created_at,updated_at,secret_ref) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET metadata_json=excluded.metadata_json,updated_at=excluded.updated_at,secret_ref=excluded.secret_ref")
            .bind(&provider.metadata.id).bind(Json(&provider.metadata)).bind(&provider.created_at).bind(&provider.updated_at).bind(reference.clone()).execute(&self.inner.pool).await;
    if let Err(error) = saved {
      if let Some(reference) = created {
        let _ = secrets::delete(&reference).await;
      }
      return Err(error.into());
    }
    if old != reference
      && let Some(old) = old
      && let Err(error) = secrets::delete(&old).await
    {
      log::warn!("Superseded AI credential cleanup failed: {}", error.code);
    }
    Ok(self.public_provider(provider))
  }
  pub async fn delete_provider(&self, id: &str) -> BackendResult<()> {
    environment::ensure_mutable(id)?;
    policy::validate_id(id)?;
    let _mutation = self.inner.mutation.lock().await;
    let current = match self.stored_provider(id).await {
      Ok(provider) => provider,
      Err(error) if error.code == "AI_PROVIDER_NOT_FOUND" => return Ok(()),
      Err(error) => return Err(error),
    };
    sqlx::query("DELETE FROM ai_providers WHERE id=?")
      .bind(id)
      .execute(&self.inner.pool)
      .await?;
    // A failed SQL deletion must leave the still-live row's credential intact.
    // A cleanup failure after commit is an orphan secret, never a broken provider.
    if let Some(reference) = current.secret_ref
      && let Err(error) = secrets::delete(&reference).await
    {
      log::warn!(
        "Deleted AI provider credential cleanup failed: {}",
        error.code
      );
    }
    Ok(())
  }
  pub(crate) async fn provider_key(&self, provider: &StoredProvider) -> BackendResult<String> {
    if let Some(environment) = self
      .inner
      .environment_providers
      .iter()
      .find(|environment| environment.metadata.metadata.kind == provider.metadata.kind)
    {
      return Ok(environment.key().to_owned());
    }
    if provider.metadata.kind == ProviderKind::Ollama {
      return Ok(String::new());
    }
    if let Some(reference) = &provider.secret_ref {
      return secrets::read(reference).await;
    }
    if policy::local(&provider.metadata) {
      return Ok("ollama".into());
    }
    Err(BackendError::new(
      "AI_KEY_MISSING",
      "AI provider API key is not configured",
    ))
  }
}
