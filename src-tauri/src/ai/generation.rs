use super::{AiService, GenerateRequest, GenerateResult, ProviderMetadata, TokenUsage, policy};
use crate::error::{BackendError, BackendResult};
use futures_util::StreamExt;
use serde_json::{Value, json};
impl AiService {
    pub async fn generate(&self, request: GenerateRequest) -> BackendResult<GenerateResult> {
        policy::validate_generate(&request)?;
        let _slot = self
            .inner
            .queue
            .clone()
            .try_acquire_owned()
            .map_err(|_| BackendError::new("AI_QUEUE_FULL", "AI generation queue is full"))?;
        let _worker = self.inner.workers.acquire().await.map_err(|_| failed())?;
        let provider = self.stored_provider(&request.provider_id).await?;
        if request.require_context_consent && !policy::local(&provider.metadata) {
            let preferences = crate::settings::SettingsStore::new(self.inner.pool.clone())
                .read_setting("marklab.preferences")
                .await?;
            if !preferences.is_some_and(|value| {
                value
                    .state
                    .get("aiCompletionCloudContextConsent")
                    .and_then(Value::as_bool)
                    == Some(true)
            }) {
                return Err(BackendError::new(
                    "AI_CONTEXT_CONSENT_REQUIRED",
                    "Cloud AI inline completion requires explicit context consent",
                ));
            }
        }
        let key = self.provider_key(&provider).await?;
        let builder = build_request(&self.inner.client, &provider.metadata, &key, &request)?;
        let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(120);
        let response = send_with_retry(builder, deadline).await?;
        if !response.status().is_success() {
            return Err(failed());
        }
        let mut body = Vec::new();
        let mut stream = response.bytes_stream();
        while let Some(chunk) = stream.next().await {
            if tokio::time::Instant::now() >= deadline {
                return Err(failed());
            }
            let chunk = chunk.map_err(|_| failed())?;
            if body.len() + chunk.len() > 4 * 1024 * 1024 {
                return Err(failed());
            }
            body.extend_from_slice(&chunk);
        }
        let value: Value = serde_json::from_slice(&body).map_err(|_| failed())?;
        parse_response(&provider.metadata.kind, &value)
    }
    pub async fn test_provider(&self, id: &str) -> BackendResult<()> {
        self.generate(GenerateRequest {
            require_context_consent: false,
            provider_id: id.into(),
            prompt: "Reply with OK.".into(),
            system: None,
            max_output_tokens: Some(8),
            temperature: None,
        })
        .await?;
        Ok(())
    }
}
fn build_request(
    client: &reqwest::Client,
    provider: &ProviderMetadata,
    key: &str,
    request: &GenerateRequest,
) -> BackendResult<reqwest::RequestBuilder> {
    let max = request.max_output_tokens.unwrap_or(4096);
    let mut messages = vec![];
    if let Some(system) = &request.system {
        messages.push(json!({"role":"system","content":system}));
    }
    messages.push(json!({"role":"user","content":request.prompt}));
    let (url, mut body) = match provider.kind.as_str() {
        "openai" => (
            "https://api.openai.com/v1/responses".to_string(),
            json!({"model":provider.model,"input":request.prompt,"max_output_tokens":max.max(16)}),
        ),
        "anthropic" => (
            "https://api.anthropic.com/v1/messages".into(),
            json!({"model":provider.model,"messages":[{"role":"user","content":request.prompt}],"max_tokens":max}),
        ),
        "google" => {
            let model = provider
                .model
                .strip_prefix("models/")
                .unwrap_or(&provider.model);
            let mut url =
                url::Url::parse("https://generativelanguage.googleapis.com/v1beta/models/")
                    .map_err(|_| failed())?;
            url.path_segments_mut()
                .map_err(|_| failed())?
                .pop_if_empty()
                .push(&format!("{model}:generateContent"));
            (
                url.to_string(),
                json!({"contents":[{"role":"user","parts":[{"text":request.prompt}]}],"generationConfig":{"maxOutputTokens":max}}),
            )
        }
        _ => {
            let base = if provider.kind == "deepseek" {
                "https://api.deepseek.com"
            } else {
                provider.base_url.as_deref().ok_or_else(failed)?
            };
            (
                format!("{}/chat/completions", base.trim_end_matches('/')),
                json!({"model":provider.model,"messages":messages,"max_tokens":max,"stream":false}),
            )
        }
    };
    if let Some(system) = &request.system {
        match provider.kind.as_str() {
            "openai" => {
                body["instructions"] = json!(system);
            }
            "anthropic" => {
                body["system"] = json!(system);
            }
            "google" => {
                body["systemInstruction"] = json!({"parts":[{"text":system}]});
            }
            _ => {}
        }
    }
    if let Some(temperature) = request.temperature {
        if provider.kind == "google" {
            body["generationConfig"]["temperature"] = json!(temperature);
        } else {
            body["temperature"] = json!(temperature);
        }
    }
    let builder = client.post(url).json(&body);
    Ok(match provider.kind.as_str() {
        "anthropic" => builder
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01"),
        "google" => builder.header("x-goog-api-key", key),
        _ => builder.bearer_auth(key),
    })
}
fn parse_response(kind: &str, value: &Value) -> BackendResult<GenerateResult> {
    let (text, reason, input, output, total) = match kind {
        "openai" => {
            let text = value
                .get("output")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|item| item.get("content").and_then(Value::as_array))
                        .flatten()
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect::<String>()
                })
                .unwrap_or_default();
            let reason = if value["status"] == "incomplete" {
                "length"
            } else {
                "stop"
            };
            (
                text,
                reason.to_string(),
                value["usage"]["input_tokens"].as_u64(),
                value["usage"]["output_tokens"].as_u64(),
                value["usage"]["total_tokens"].as_u64(),
            )
        }
        "anthropic" => {
            let text = value
                .get("content")
                .and_then(Value::as_array)
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|part| part.get("text").and_then(Value::as_str))
                        .collect()
                })
                .unwrap_or_default();
            (
                text,
                match value["stop_reason"].as_str() {
                    Some("max_tokens") => "length",
                    Some("end_turn" | "stop_sequence") => "stop",
                    _ => "other",
                }
                .into(),
                value["usage"]["input_tokens"].as_u64(),
                value["usage"]["output_tokens"].as_u64(),
                None,
            )
        }
        "google" => {
            let candidate = &value["candidates"][0];
            let text = candidate["content"]["parts"]
                .as_array()
                .map(|parts| {
                    parts
                        .iter()
                        .filter_map(|part| part["text"].as_str())
                        .collect()
                })
                .unwrap_or_default();
            (
                text,
                if candidate["finishReason"] == "MAX_TOKENS" {
                    "length"
                } else {
                    "stop"
                }
                .into(),
                value["usageMetadata"]["promptTokenCount"].as_u64(),
                value["usageMetadata"]["candidatesTokenCount"].as_u64(),
                value["usageMetadata"]["totalTokenCount"].as_u64(),
            )
        }
        _ => {
            let choice = &value["choices"][0];
            (
                choice["message"]["content"]
                    .as_str()
                    .unwrap_or_default()
                    .into(),
                choice["finish_reason"].as_str().unwrap_or("other").into(),
                value["usage"]["prompt_tokens"].as_u64(),
                value["usage"]["completion_tokens"].as_u64(),
                value["usage"]["total_tokens"].as_u64(),
            )
        }
    };
    let has_result = match kind {
        "openai" => value.get("output").is_some(),
        "anthropic" => value.get("content").is_some(),
        "google" => value.get("candidates").is_some(),
        _ => value.get("choices").is_some(),
    };
    if value.get("error").is_some_and(|error| !error.is_null()) || !has_result {
        return Err(failed());
    }
    Ok(GenerateResult {
        text,
        finish_reason: reason,
        usage: TokenUsage {
            input_tokens: input,
            output_tokens: output,
            total_tokens: total.or_else(|| input.zip(output).and_then(|(i, o)| i.checked_add(o))),
        },
        warnings: vec![],
    })
}
fn failed() -> BackendError {
    BackendError::new("AI_REQUEST_FAILED", "AI provider request failed")
}

async fn send_with_retry(
    builder: reqwest::RequestBuilder,
    deadline: tokio::time::Instant,
) -> BackendResult<reqwest::Response> {
    for attempt in 0..2 {
        let request = builder.try_clone().ok_or_else(failed)?;
        let result = tokio::time::timeout_at(deadline, request.send())
            .await
            .map_err(|_| failed())?;
        match result {
            Ok(response)
                if attempt == 0
                    && (response.status().is_server_error()
                        || response.status().as_u16() == 429) => {}
            Ok(response) => return Ok(response),
            Err(_) if attempt == 0 => {}
            Err(_) => return Err(failed()),
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    Err(failed())
}

#[cfg(test)]
#[path = "generation_tests.rs"]
mod tests;
