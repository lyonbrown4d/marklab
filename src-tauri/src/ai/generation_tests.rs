use super::*;
#[test]
fn parses_successful_provider_responses_and_keeps_credentials_out_of_errors() {
    let responses = [
        (
            "openai",
            json!({"error":null,"status":"completed","output":[{"type":"message","content":[{"type":"output_text","text":"hello"}]}],"usage":{"input_tokens":2,"output_tokens":3,"total_tokens":5}}),
        ),
        (
            "anthropic",
            json!({"content":[{"type":"text","text":"hello"}],"stop_reason":"end_turn","usage":{"input_tokens":2,"output_tokens":3}}),
        ),
        (
            "google",
            json!({"candidates":[{"content":{"parts":[{"text":"hello"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":2,"candidatesTokenCount":3,"totalTokenCount":5}}),
        ),
        (
            "ollama",
            json!({"choices":[{"message":{"content":"hello"},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}),
        ),
    ];
    for (kind, response) in responses {
        let result = parse_response(kind, &response).unwrap();
        assert_eq!(result.text, "hello");
        assert_eq!(result.finish_reason, "stop");
        assert_eq!(result.usage.total_tokens, Some(5));
    }
    let error = parse_response("openai", &json!({"error":{"message":"secret-token"}}))
        .err()
        .unwrap();
    assert_eq!(error.message, "AI provider request failed");
    assert!(parse_response("openai-compatible", &json!({"unexpected":true})).is_err());
}
#[test]
fn openai_request_uses_responses_fields_and_api_minimum_token_budget() {
    let provider = ProviderMetadata {
        id: "p".into(),
        label: "Provider".into(),
        kind: "openai".into(),
        model: "user-selected-model".into(),
        base_url: None,
    };
    let request = GenerateRequest {
        require_context_consent: false,
        provider_id: "p".into(),
        prompt: "prompt".into(),
        system: Some("system".into()),
        max_output_tokens: Some(8),
        temperature: None,
    };
    let built = build_request(&reqwest::Client::new(), &provider, "test-key", &request)
        .unwrap()
        .build()
        .unwrap();
    assert_eq!(built.url().as_str(), "https://api.openai.com/v1/responses");
    let body: Value = serde_json::from_slice(built.body().unwrap().as_bytes().unwrap()).unwrap();
    assert_eq!(body["instructions"], "system");
    assert_eq!(body["input"], "prompt");
    assert_eq!(body["max_output_tokens"], 16);
    assert_eq!(body["model"], "user-selected-model");
}
