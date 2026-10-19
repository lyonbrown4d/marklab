use super::*;
use crate::{database::Database, error::BackendResult};
use serde_json::json;
#[tokio::test]
async fn provider_metadata_is_durable_redacted_and_url_policies_are_enforced() -> BackendResult<()>
{
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = AiService::new(database.pool.clone()).await?;
  let input = serde_json::from_value(
    json!({"id":"local","label":"Local","kind":"ollama","model":"model","baseUrl":"http://127.0.0.1:11434/v1/"}),
  )?;
  let provider = service.update_provider(input).await?;
  assert_eq!(provider.locality, "local");
  assert!(provider.available);
  assert!(!provider.requires_api_key);
  let public = serde_json::to_value(&provider)?;
  assert!(!public.as_object().unwrap().contains_key("secretRef"));
  assert!(!public.as_object().unwrap().contains_key("apiKey"));
  assert_eq!(
    provider.metadata.base_url.as_deref(),
    Some("http://127.0.0.1:11434/v1")
  );
  for input in [
    json!({"id":"bad","label":"Bad","kind":"ollama","model":"m","baseUrl":"https://example.com"}),
    json!({"id":"bad","label":"Bad","kind":"openai-compatible","model":"m","baseUrl":"http://example.com"}),
    json!({"id":"bad","label":"Bad","kind":"openai","model":"m","baseUrl":"https://example.com"}),
  ] {
    assert!(
      service
        .update_provider(serde_json::from_value(input)?)
        .await
        .is_err()
    );
  }
  assert_eq!(service.list_providers().await?.len(), 1);
  service.delete_provider("local").await?;
  assert!(service.list_providers().await?.is_empty());
  database.pool.close().await;
  Ok(())
}
#[test]
fn inline_context_remains_untrusted_and_cleanup_preserves_continuations() {
  let input:InlineRequest=serde_json::from_value(json!({"providerId":"local","completionSessionId":"s","revision":1,"prefix":"context\nHello ","suffix":".\nreference","language":"auto","length":"short","excludedSuggestions":["no"]})).unwrap();
  prompt::validate(&input).unwrap();
  let request = prompt::build(&input);
  assert!(request.prompt.contains("UNTRUSTED_DOCUMENT_DATA_START"));
  assert!(request.prompt.contains("contextBefore"));
  assert_eq!(request.max_output_tokens, Some(48));
  assert_eq!(prompt::clean("```text\nHello world\n```", &input), "world");
  assert_eq!(prompt::clean("\"no\"", &input), "");
  assert_eq!(prompt::clean("a\0b\r\nc", &input), "ab\nc");
}

#[tokio::test]
async fn stored_provider_tampering_is_rejected_and_sql_delete_failure_retains_credential_reference()
-> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = AiService::new(database.pool.clone()).await?;
  service.update_provider(serde_json::from_value(json!({"id":"local","label":"Local","kind":"ollama","model":"m","baseUrl":"http://127.0.0.1:11434/v1"}))?).await?;
  let reference = format!("ai:{}", uuid::Uuid::new_v4());
  sqlx::query("UPDATE ai_providers SET secret_ref=? WHERE id='local'")
    .bind(&reference)
    .execute(&database.pool)
    .await?;
  sqlx::query("CREATE TRIGGER refuse_ai_delete BEFORE DELETE ON ai_providers BEGIN SELECT RAISE(ABORT,'fixture deletion failure'); END").execute(&database.pool).await?;
  let error = service.delete_provider("local").await.err().unwrap();
  assert_eq!(error.code, "DATABASE_ERROR");
  assert_eq!(
    service
      .stored_provider("local")
      .await?
      .secret_ref
      .as_deref(),
    Some(reference.as_str())
  );
  sqlx::query("UPDATE ai_providers SET metadata_json=? WHERE id='local'").bind(json!({"id":"local","label":"Local","kind":"openai","model":"m","baseUrl":"https://not-the-provider.invalid"}).to_string()).execute(&database.pool).await?;
  assert!(service.stored_provider("local").await.is_err());
  sqlx::query("UPDATE ai_providers SET metadata_json=? WHERE id='local'")
    .bind(
      json!({"id":"another-id","label":"Local","kind":"openai-compatible","model":"m"}).to_string(),
    )
    .execute(&database.pool)
    .await?;
  assert!(service.stored_provider("local").await.is_err());
  database.pool.close().await;
  Ok(())
}

#[tokio::test]
async fn inline_consent_is_explicit_and_owner_cleanup_preserves_other_window_jobs()
-> BackendResult<()> {
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = AiService::new(database.pool.clone()).await?;
  let remote = ProviderMetadata {
    id: "p".into(),
    label: "Remote".into(),
    kind: ProviderKind::OpenaiCompatible,
    model: "m".into(),
    base_url: Some("https://api.example.com/v1".into()),
  };
  assert_eq!(
    service
      .check_consent(&remote, true)
      .await
      .err()
      .unwrap()
      .code,
    "AI_CONTEXT_CONSENT_REQUIRED"
  );
  let settings = crate::settings::SettingsStore::new(database.pool.clone());
  settings
    .set(
      "marklab.preferences",
      "main",
      json!({"state":{"aiCompletionCloudContextConsent":true},"version":1}),
    )
    .await?;
  service.check_consent(&remote, true).await?;
  settings
    .set(
      "marklab.preferences",
      "main",
      json!({"state":{"aiCompletionCloudContextConsent":false},"version":1}),
    )
    .await?;
  assert!(service.check_consent(&remote, true).await.is_err());
  let local = ProviderMetadata {
    base_url: Some("http://127.0.0.1:11434/v1".into()),
    ..remote
  };
  service.check_consent(&local, true).await?;
  let (first, first_rx) = tokio::sync::watch::channel(false);
  let (second, second_rx) = tokio::sync::watch::channel(false);
  for (id, owner, cancel) in [("first", "window-a", first), ("second", "window-b", second)] {
    service.inner.jobs.lock().await.insert(
      id.into(),
      Job {
        owner: owner.into(),
        session: Some("same-session".into()),
        channel: "ai-completion-event",
        cancel,
      },
    );
    service
      .inner
      .attempts
      .lock()
      .await
      .insert((owner.into(), "same-session".into()), id.into());
  }
  service.cancel_owner("window-a").await;
  assert!(*first_rx.borrow());
  assert!(!*second_rx.borrow());
  assert!(service.inner.jobs.lock().await.contains_key("second"));
  assert_eq!(service.inner.attempts.lock().await.len(), 1);
  service.cancel_owner("window-b").await;
  database.pool.close().await;
  Ok(())
}

#[test]
fn inline_output_and_request_limits_use_frontend_utf16_units() {
  let mut input: InlineRequest = serde_json::from_value(json!({"providerId":"local","completionSessionId":"s","revision":1,"prefix":"x","suffix":"","language":"auto","length":"short","excludedSuggestions":[]})).unwrap();
  let result = prompt::clean(&"😀".repeat(512), &input);
  assert_eq!(result.encode_utf16().count(), 512);
  assert_eq!(result.chars().count(), 256);
  input.excluded_suggestions = vec![result.clone()];
  prompt::validate(&input).unwrap();
  assert_eq!(prompt::clean(&result, &input), "");
  input.prefix = "😀".repeat(4097);
  assert!(prompt::validate(&input).is_err());
}

#[test]
fn provider_kind_wire_contract_is_closed_and_round_trips_all_supported_providers() {
  for kind in [
    ProviderKind::Openai,
    ProviderKind::Anthropic,
    ProviderKind::Google,
    ProviderKind::Deepseek,
    ProviderKind::OpenaiCompatible,
    ProviderKind::Ollama,
  ] {
    let json = serde_json::to_value(kind).unwrap();
    assert_eq!(json, kind.as_str());
    assert_eq!(serde_json::from_value::<ProviderKind>(json).unwrap(), kind);
  }
  for kind in [
    "OpenAI",
    "openAI",
    "OPENAI",
    "unknown",
    "openai_compatible",
    "",
  ] {
    assert!(serde_json::from_value::<ProviderKind>(json!(kind)).is_err());
    assert!(
      serde_json::from_value::<ProviderUpdate>(
        json!({"id":"p","label":"P","kind":kind,"model":"m"})
      )
      .is_err()
    );
  }
  assert!(
    serde_json::from_value::<ProviderMetadata>(
      json!({"id":"p","label":"P","kind":"openai","model":"m","apiKey":"secret"})
    )
    .is_err()
  );
}

#[tokio::test]
async fn provider_probe_does_not_retry_and_public_generation_retries_once() -> BackendResult<()> {
  use super::http_fixture::{Fixture, Reply};
  use std::sync::atomic::Ordering;
  let directory = tempfile::tempdir()?;
  let database = Database::open(directory.path()).await?;
  let service = AiService::new(database.pool.clone()).await?;
  for probe in [true, false] {
    let mut failure = Reply::json(json!({"error":{"message":"do-not-expose-secret"}}));
    failure.status = 429;
    failure.headers = "retry-after-ms: 1\r\n";
    let success = Reply::json(
      json!({"id":"a","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"OK"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":1,"total_tokens":3}}),
    );
    let fixture = Fixture::new(vec![failure, success]).await;
    service.update_provider(serde_json::from_value(json!({"id":"local","label":"Local","kind":"ollama","model":"m","baseUrl":format!("{}/v1",fixture.base_url())}))?).await?;
    if probe {
      let error = service.test_provider("local").await.err().unwrap();
      assert_eq!(error.message, "AI provider request failed");
      assert_eq!(fixture.received.load(Ordering::Acquire), 1);
    } else {
      let result = service
        .generate(GenerateRequest {
          require_context_consent: false,
          provider_id: "local".into(),
          prompt: "prompt".into(),
          system: None,
          max_output_tokens: Some(16),
          temperature: None,
        })
        .await?;
      assert_eq!(result.text, "OK");
      assert_eq!(fixture.received.load(Ordering::Acquire), 2);
    }
  }
  database.pool.close().await;
  Ok(())
}
