use super::{
    http_fixture::{Fixture, Reply},
    *,
};
use serde_json::{Value, json};
use std::{sync::atomic::Ordering, time::Duration};

fn provider(kind: &str, model: &str) -> ProviderMetadata {
    ProviderMetadata {
        id: "p".into(),
        label: "Provider".into(),
        kind: serde_json::from_value(json!(kind)).unwrap(),
        model: model.into(),
        base_url: ["ollama", "openai-compatible"]
            .contains(&kind)
            .then(|| "http://127.0.0.1:11434/custom/v1".into()),
    }
}
fn input() -> GenerateRequest {
    GenerateRequest {
        require_context_consent: false,
        provider_id: "p".into(),
        prompt: "prompt".into(),
        system: Some("system".into()),
        max_output_tokens: Some(8),
        temperature: Some(0.35),
    }
}
fn chat() -> Value {
    json!({"id":"c", "object":"chat.completion", "choices":[{"index":0,"message":{"role":"assistant","content":"hello"},"finish_reason":"stop"}], "usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}})
}
async fn execute(
    fixture: &Fixture,
    metadata: &ProviderMetadata,
    input: &GenerateRequest,
) -> crate::error::BackendResult<GenerateResult> {
    let model = sdk::model(
        metadata,
        if metadata.kind == ProviderKind::Ollama {
            ""
        } else {
            "test-key"
        },
        fixture.transport.clone(),
    )?;
    let (request, warnings) = sdk::request(metadata, input);
    let response = generation::call_with_retry(
        &model,
        request,
        fixture.transport.inner.exceeded.clone(),
        0,
        Duration::from_secs(3),
    )
    .await
    .map_err(|_| sdk::failed())?;
    sdk::result(response, warnings)
}
#[tokio::test]
async fn sdk_http_wires_preserve_routes_sampling_credentials_and_normalized_usage() {
    let fixtures = [
        (
            provider("openai", "gpt-5-mini"),
            json!({"id":"r","object":"response","status":"completed","output":[{"id":"m","type":"message","role":"assistant","status":"completed","content":[{"type":"output_text","text":"hello","annotations":[]}]}],"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}),
        ),
        (
            provider("anthropic", "claude-opus-4-7"),
            json!({"id":"a","type":"message","role":"assistant","model":"claude-opus-4-7","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":1,"cache_read_input_tokens":1,"cache_creation_input_tokens":2,"output_tokens":3}}),
        ),
        (
            provider("google", "models/gemini-2.5-flash"),
            json!({"candidates":[{"content":{"role":"model","parts":[{"text":"hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":3,"thoughtsTokenCount":4,"toolUsePromptTokenCount":1,"totalTokenCount":10}}),
        ),
        (provider("deepseek", "deepseek-chat"), chat()),
        (provider("ollama", "local-model"), chat()),
        (provider("openai-compatible", "custom-model"), chat()),
    ];
    for (metadata, response) in fixtures {
        let fixture = Fixture::new(vec![Reply::json(response)]).await;
        let result = execute(&fixture, &metadata, &input()).await.unwrap();
        assert_eq!(result.text, "hello", "{}", metadata.kind.as_str());
        assert_eq!(result.finish_reason, "stop");
        let requests = fixture.requests.lock().await;
        let request = &requests[0];
        let body: Value = serde_json::from_slice(request.body()).unwrap();
        assert!(!body.to_string().contains("test-key"));
        match metadata.kind.as_str() {
            "openai" => {
                assert_eq!(
                    request.uri().to_string(),
                    "https://api.openai.com/v1/responses"
                );
                assert_eq!(body["max_output_tokens"], 16);
                assert_eq!(body["instructions"], "system");
                assert!(body.get("input").is_some());
                assert!(body.get("temperature").is_none());
                assert_eq!(result.warnings.len(), 1);
            }
            "anthropic" => {
                assert_eq!(request.uri().path(), "/v1/messages");
                assert_eq!(request.headers()["x-api-key"], "test-key");
                assert!(body.get("temperature").is_none());
                assert_eq!(result.warnings.len(), 1);
                assert_eq!(result.usage.input_tokens, Some(4));
            }
            "google" => {
                assert_eq!(
                    request.uri().path(),
                    "/v1beta/models/gemini-2.5-flash:generateContent"
                );
                assert_eq!(body["generationConfig"]["temperature"], 0.35);
                assert_eq!(result.usage.input_tokens, Some(3));
                assert_eq!(result.usage.output_tokens, Some(7));
            }
            "ollama" => {
                assert_eq!(request.uri().path(), "/custom/v1/chat/completions");
                assert!(request.headers().get("authorization").is_none());
            }
            "openai-compatible" => {
                assert_eq!(request.uri().path(), "/custom/v1/chat/completions");
                assert_eq!(body["temperature"], 0.35);
                assert_eq!(request.headers()["authorization"], "Bearer test-key");
            }
            "deepseek" => assert_eq!(request.uri().host(), Some("api.deepseek.com")),
            _ => unreachable!(),
        }
    }
}
#[tokio::test]
async fn anthropic_legacy_temperature_is_clamped_and_invalid_empty_choices_never_succeed() {
    let reply = json!({"id":"a","type":"message","role":"assistant","content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":2,"output_tokens":3}});
    let fixture = Fixture::new(vec![Reply::json(reply)]).await;
    let mut request = input();
    request.temperature = Some(1.8);
    let result = execute(
        &fixture,
        &provider("anthropic", "claude-haiku-4-5"),
        &request,
    )
    .await
    .unwrap();
    assert_eq!(result.warnings.len(), 1);
    let requests = fixture.requests.lock().await;
    let body: Value = serde_json::from_slice(requests[0].body()).unwrap();
    assert_eq!(body["temperature"], 1.0);
    drop(requests);
    let empty = Fixture::new(vec![Reply::json(json!({"choices":[]}))]).await;
    let error = execute(&empty, &provider("openai-compatible", "m"), &input())
        .await
        .err()
        .unwrap();
    assert_eq!(error.message, "AI provider request failed");
}
#[tokio::test]
async fn retries_are_bounded_probe_has_zero_retry_and_deadline_includes_body_wait() {
    for retries in [0, 1] {
        let mut error = Reply::json(json!({"error":{"message":"secret-key"}}));
        error.status = 429;
        error.headers = "retry-after-ms: 1\r\n";
        let fixture = Fixture::new(vec![error, Reply::json(chat())]).await;
        let metadata = provider("openai-compatible", "m");
        let model = sdk::model(&metadata, "key", fixture.transport.clone()).unwrap();
        let result = generation::call_with_retry(
            &model,
            sdk::request(&metadata, &input()).0,
            fixture.transport.inner.exceeded.clone(),
            retries,
            Duration::from_secs(2),
        )
        .await;
        assert_eq!(result.is_ok(), retries == 1);
        assert_eq!(
            fixture.requests.lock().await.len(),
            usize::from(retries) + 1
        );
    }
    let mut slow = Reply::json(chat());
    slow.delay_body = Duration::from_secs(60);
    let fixture = Fixture::new(vec![slow]).await;
    let metadata = provider("openai-compatible", "m");
    let model = sdk::model(&metadata, "key", fixture.transport.clone()).unwrap();
    let result = generation::call_with_retry(
        &model,
        sdk::request(&metadata, &input()).0,
        fixture.transport.inner.exceeded.clone(),
        1,
        Duration::from_millis(30),
    )
    .await;
    assert!(matches!(result, Err(generation::CallError::Timeout)));
}
#[tokio::test]
async fn all_http_statuses_enforce_actual_body_budget_before_sdk_decode() {
    for status in [200, 429] {
        let fixture = Fixture::new(vec![Reply {
            status,
            body: vec![b'x'; transport::MAX_RESPONSE_BYTES + 1],
            delay_body: Duration::ZERO,
            headers: "",
        }])
        .await;
        let metadata = provider("openai-compatible", "m");
        let model = sdk::model(&metadata, "key", fixture.transport.clone()).unwrap();
        let result = generation::call_with_retry(
            &model,
            sdk::request(&metadata, &input()).0,
            fixture.transport.inner.exceeded.clone(),
            1,
            Duration::from_secs(3),
        )
        .await;
        assert!(matches!(result, Err(generation::CallError::TooLarge)));
        assert!(fixture.transport.inner.exceeded.load(Ordering::Acquire));
        assert_eq!(fixture.requests.lock().await.len(), 1);
    }
}

#[tokio::test]
async fn cancelling_pending_sdk_body_releases_the_http_connection() {
    let mut reply = Reply::json(chat());
    reply.delay_body = Duration::from_secs(60);
    let fixture = Fixture::new(vec![reply]).await;
    let metadata = provider("openai-compatible", "m");
    let model = sdk::model(&metadata, "key", fixture.transport.clone()).unwrap();
    let (request, _) = sdk::request(&metadata, &input());
    let exceeded = fixture.transport.inner.exceeded.clone();
    let worker = tokio::spawn(async move {
        generation::call_with_retry(&model, request, exceeded, 1, Duration::from_secs(120)).await
    });
    tokio::time::timeout(Duration::from_secs(2), async {
        while !fixture.waiting_body.load(Ordering::Acquire) {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    // This is the same dropped-future cancellation boundary used by jobs::start_generation.
    worker.abort();
    assert!(worker.await.unwrap_err().is_cancelled());
    tokio::time::timeout(Duration::from_secs(2), async {
        while !fixture.disconnected.load(Ordering::Acquire) {
            tokio::time::sleep(Duration::from_millis(1)).await;
        }
    })
    .await
    .unwrap();
}
