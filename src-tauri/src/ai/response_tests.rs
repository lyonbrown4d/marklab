use super::{
  generation,
  http_fixture::{Fixture, Reply},
  *,
};
use serde_json::json;
use std::time::Duration;

#[tokio::test]
async fn google_finish_reasons_keep_legacy_dto_names_including_content_filter() {
  let metadata = ProviderMetadata {
    id: "p".into(),
    label: "P".into(),
    kind: ProviderKind::Google,
    model: "gemini-2.5-flash".into(),
    base_url: None,
  };
  let input = GenerateRequest {
    require_context_consent: false,
    provider_id: "p".into(),
    prompt: "prompt".into(),
    system: None,
    max_output_tokens: Some(20),
    temperature: None,
  };
  for (reason, expected) in [
    ("MAX_TOKENS", "length"),
    ("SAFETY", "content-filter"),
    ("RECITATION", "content-filter"),
    ("CONTINUATION", "length"),
    ("MALFORMED_FUNCTION_CALL", "error"),
  ] {
    let fixture = Fixture::new(vec![Reply::json(json!({"candidates":[{"content":{"role":"model","parts":[{"text":"partial"}]},"finishReason":reason}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":3,"totalTokenCount":5}}))]).await;
    let model = sdk::model(&metadata, "key", fixture.transport.clone()).unwrap();
    let (request, warnings) = sdk::request(&metadata, &input);
    let response = generation::call_with_retry(
      &model,
      request,
      fixture.transport.inner.exceeded.clone(),
      0,
      Duration::from_secs(3),
    )
    .await
    .unwrap();
    let result = sdk::result(response, warnings).unwrap();
    assert_eq!(result.finish_reason, expected, "{reason}");
  }
}

#[tokio::test]
async fn unknown_models_receive_compatible_sampling_policy_and_redirects_are_not_followed() {
  for (kind, model, omit) in [
    (ProviderKind::Anthropic, "claude-future-unlisted", true),
    (ProviderKind::Openai, "gpt-8-mini", true),
    (ProviderKind::OpenaiCompatible, "gpt-5-mini", false),
  ] {
    let metadata = ProviderMetadata {
      id: "p".into(),
      label: "P".into(),
      kind,
      model: model.into(),
      base_url: None,
    };
    let (temperature, warnings) = sampling::temperature(&metadata, Some(0.35));
    assert_eq!(temperature.is_none(), omit);
    assert_eq!(!warnings.is_empty(), omit);
  }
  let mut reply = Reply::json(json!({"redirect":true}));
  reply.status = 302;
  reply.headers = "Location: https://must-not-receive-credentials.invalid\r\n";
  let fixture = Fixture::new(vec![reply]).await;
  let metadata = ProviderMetadata {
    id: "p".into(),
    label: "P".into(),
    kind: ProviderKind::Openai,
    model: "gpt-4o".into(),
    base_url: None,
  };
  let model = sdk::model(&metadata, "secret-key", fixture.transport.clone()).unwrap();
  let input = GenerateRequest {
    require_context_consent: false,
    provider_id: "p".into(),
    prompt: "prompt".into(),
    system: None,
    max_output_tokens: Some(20),
    temperature: None,
  };
  let error = generation::call_with_retry(
    &model,
    sdk::request(&metadata, &input).0,
    fixture.transport.inner.exceeded.clone(),
    1,
    Duration::from_secs(3),
  )
  .await
  .unwrap_err();
  assert!(matches!(error, generation::CallError::Provider(_)));
  assert_eq!(fixture.requests.lock().await.len(), 1);
}
