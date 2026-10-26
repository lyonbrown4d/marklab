use super::*;
use crate::database::Database;
use serde_json::json;

fn profiles(values: &[(&str, &str)]) -> Vec<environment::EnvironmentProvider> {
  environment::from_lookup(|name| {
    values
      .iter()
      .find(|(key, _)| *key == name)
      .map(|(_, value)| (*value).into())
  })
}

#[test]
fn environment_profiles_require_keys_and_bound_optional_models() {
  assert!(profiles(&[("DEEPSEEK_MODEL", "custom")]).is_empty());
  assert!(profiles(&[("DEEPSEEK_API_KEY", " \n ")]).is_empty());
  assert!(profiles(&[("DEEPSEEK_API_KEY", &"x".repeat(8193))]).is_empty());
  for model in ["", "  ", &"😀".repeat(81)] {
    let providers = profiles(&[
      ("DEEPSEEK_API_KEY", "fixture-key"),
      ("DEEPSEEK_MODEL", model),
    ]);
    assert_eq!(providers[0].metadata.metadata.model, "deepseek-flash");
  }
  let providers = profiles(&[
    ("DEEPSEEK_API_KEY", "fixture-key"),
    ("DEEPSEEK_MODEL", " custom "),
  ]);
  assert_eq!(providers[0].metadata.metadata.model, "custom");
}

#[test]
fn supported_vendors_and_google_aliases_use_first_nonblank_environment_value() {
  let providers = profiles(&[
    ("OPENAI_API_KEY", "openai-fixture"),
    ("OPENAI_MODEL", " openai-model "),
    ("ANTHROPIC_API_KEY", "anthropic-fixture"),
    ("ANTHROPIC_MODEL", "anthropic-model"),
    ("GOOGLE_GENERATIVE_AI_API_KEY", " "),
    ("GEMINI_API_KEY", "gemini-fixture"),
    ("GOOGLE_API_KEY", "google-fixture"),
    ("GEMINI_MODEL", "gemini-model"),
    ("DEEPSEEK_API_KEY", "deepseek-fixture"),
    ("DEEPSEEK_MODEL", "deepseek-model"),
  ]);
  assert_eq!(providers.len(), 4);
  for (profile, (id, model, key)) in providers.iter().zip([
    ("environment.openai", "openai-model", "openai-fixture"),
    (
      "environment.anthropic",
      "anthropic-model",
      "anthropic-fixture",
    ),
    ("environment.google", "gemini-model", "gemini-fixture"),
    ("environment.deepseek", "deepseek-model", "deepseek-fixture"),
  ]) {
    assert_eq!(profile.metadata.metadata.id, id);
    assert_eq!(profile.metadata.metadata.model, model);
    assert_eq!(profile.key(), key);
  }
  assert_eq!(
    profiles(&[("GOOGLE_API_KEY", "fallback")])[0].key(),
    "fallback"
  );
  assert_eq!(
    profiles(&[
      ("GOOGLE_GENERATIVE_AI_API_KEY", "primary"),
      ("GEMINI_API_KEY", "secondary")
    ])[0]
      .key(),
    "primary"
  );
}

#[tokio::test]
async fn environment_profile_is_read_only_redacted_and_yields_to_saved_deepseek()
-> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = AiService::with_environment(
    database.pool.clone(),
    profiles(&[("DEEPSEEK_API_KEY", "fixture-key")]),
  )
  .await?;
  let providers = service.list_providers().await?;
  assert_eq!(providers.len(), 1);
  let profile = &providers[0];
  assert_eq!(profile.metadata.id, "environment.deepseek");
  assert_eq!(profile.metadata.model, "deepseek-flash");
  assert!(profile.available);
  assert!(profile.has_api_key);
  assert_eq!(profile.api_key_source, ApiKeySource::Environment);
  assert_eq!(
    profile.configuration_source,
    Some(ProviderConfigurationSource::Environment)
  );
  let encoded = serde_json::to_value(profile)?;
  assert_eq!(encoded["configurationSource"], "environment");
  assert!(!encoded.as_object().unwrap().contains_key("apiKey"));
  assert!(!encoded.as_object().unwrap().contains_key("secretRef"));
  assert!(!encoded.to_string().contains("fixture-key"));
  let resolved = service.stored_provider("environment.deepseek").await?;
  assert_eq!(service.provider_key(&resolved).await?, "fixture-key");
  assert_eq!(
    service
      .get_provider("environment.deepseek")
      .await?
      .metadata
      .model,
    "deepseek-flash"
  );

  for id in [
    "environment.openai",
    "environment.anthropic",
    "environment.google",
    "environment.deepseek",
  ] {
    let update = serde_json::from_value(json!({
      "id": id, "label": "Override", "kind": "deepseek", "model": "custom"
    }))?;
    assert_eq!(
      service.update_provider(update).await.err().unwrap().code,
      "AI_PROVIDER_READ_ONLY"
    );
    assert_eq!(
      service.delete_provider(id).await.err().unwrap().code,
      "AI_PROVIDER_READ_ONLY"
    );
  }
  let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ai_providers")
    .fetch_one(&database.pool)
    .await?;
  assert_eq!(count, 0);

  let saved = service
    .update_provider(serde_json::from_value(json!({
      "id": "my-deepseek", "label": "Mine", "kind": "deepseek", "model": "my-model"
    }))?)
    .await?;
  assert_eq!(saved.configuration_source, None);
  assert!(
    !serde_json::to_value(&saved)?
      .as_object()
      .unwrap()
      .contains_key("configurationSource")
  );
  let reference = format!("ai:{}", uuid::Uuid::new_v4());
  sqlx::query("UPDATE ai_providers SET secret_ref=? WHERE id='my-deepseek'")
    .bind(&reference)
    .execute(&database.pool)
    .await?;
  let resolved = service.stored_provider("my-deepseek").await?;
  assert_eq!(service.provider_key(&resolved).await?, "fixture-key");
  assert_eq!(
    policy::public(resolved.clone(), false).api_key_source,
    ApiKeySource::Stored
  );
  assert_eq!(
    service.get_provider("my-deepseek").await?.api_key_source,
    ApiKeySource::Environment
  );
  // Avoid accessing the OS credential store when removing the fixture row.
  sqlx::query("UPDATE ai_providers SET secret_ref=NULL WHERE id='my-deepseek'")
    .execute(&database.pool)
    .await?;
  let listed = service.list_providers().await?;
  assert_eq!(listed.len(), 1);
  assert_eq!(listed[0].metadata.id, "my-deepseek");
  // The stable environment ID remains resolvable for a previously selected session.
  assert!(
    service
      .get_provider("environment.deepseek")
      .await?
      .available
  );
  service.delete_provider("my-deepseek").await?;
  assert_eq!(
    service.list_providers().await?[0].metadata.id,
    "environment.deepseek"
  );
  database.pool.close().await;
  Ok(())
}

#[tokio::test]
async fn missing_environment_profile_cannot_be_materialized_via_reserved_id() -> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = AiService::with_environment(database.pool.clone(), vec![]).await?;
  assert!(service.list_providers().await?.is_empty());
  assert_eq!(
    service
      .get_provider("environment.deepseek")
      .await
      .err()
      .unwrap()
      .code,
    "AI_PROVIDER_NOT_FOUND"
  );
  assert_eq!(
    service
      .delete_provider("environment.deepseek")
      .await
      .err()
      .unwrap()
      .code,
    "AI_PROVIDER_READ_ONLY"
  );
  service
    .update_provider(serde_json::from_value(json!({
      "id": "manual", "label": "Manual", "kind": "deepseek", "model": "custom"
    }))?)
    .await?;
  let manual = service.stored_provider("manual").await?;
  assert_eq!(
    service.provider_key(&manual).await.err().unwrap().code,
    "AI_KEY_MISSING"
  );
  assert_eq!(
    service.get_provider("manual").await?.api_key_source,
    ApiKeySource::None
  );
  database.pool.close().await;
  Ok(())
}

#[test]
fn clap_capture_reads_inherited_environment_in_an_isolated_process() -> BackendResult<()> {
  let mut child = std::process::Command::new(std::env::current_exe()?);
  for name in [
    "OPENAI_API_KEY",
    "OPENAI_MODEL",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_MODEL",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_MODEL",
    "GEMINI_MODEL",
    "DEEPSEEK_API_KEY",
    "DEEPSEEK_MODEL",
  ] {
    child.env_remove(name);
  }
  let output = child
    .args([
      "--exact",
      "ai::environment_tests::clap_capture_child_probe",
      "--test-threads=1",
    ])
    .env("MARKLAB_AI_ENVIRONMENT_TEST_CHILD", "1")
    .env("DEEPSEEK_API_KEY", "fixture-clap-key")
    .env("DEEPSEEK_MODEL", " fixture-clap-model ")
    .output()?;
  // Child output is intentionally excluded from failure text to keep credential data private.
  assert!(
    output.status.success(),
    "isolated environment capture probe failed"
  );
  Ok(())
}

#[test]
fn clap_capture_child_probe() -> BackendResult<()> {
  if std::env::var("MARKLAB_AI_ENVIRONMENT_TEST_CHILD")
    .ok()
    .as_deref()
    != Some("1")
  {
    return Ok(());
  }
  let providers = environment::capture()?;
  assert_eq!(providers.len(), 1);
  assert_eq!(providers[0].metadata.metadata.id, "environment.deepseek");
  assert_eq!(providers[0].metadata.metadata.model, "fixture-clap-model");
  assert!(providers[0].key() == "fixture-clap-key");
  Ok(())
}
