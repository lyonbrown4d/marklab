use super::{
    GenerateRequest, GenerateResult, ProviderKind, ProviderMetadata, TokenUsage, sampling,
};
use crate::error::{BackendError, BackendResult};
use rig_core::{
    completion::{
        CompletionRequest, CompletionResponse, FinishReason, GenerationOptions, OnUnsupported,
    },
    driver::DynModel,
    http_client::HttpClientExt,
    operation::Completion,
    providers::{
        anthropic::AnthropicConfig,
        gemini::GeminiConfig,
        openai::{OpenAIConfig, wire},
    },
};
const COMPATIBLE: wire::Dialect = wire::Dialect::gateway("openai-compatible", "", "");

pub(super) fn model(
    provider: &ProviderMetadata,
    key: &str,
    http: impl HttpClientExt + 'static,
) -> BackendResult<DynModel<Completion>> {
    let model = provider.model.clone();
    Ok(match provider.kind {
        ProviderKind::Openai => OpenAIConfig::new(key.to_owned())
            .connect(http)
            .responses(model)
            .erase(),
        ProviderKind::Anthropic => AnthropicConfig::new(key.to_owned())
            .connect(http)
            .completion(model)
            .erase(),
        // Gemini::completion is GenerateContent, not the newer Interactions route.
        ProviderKind::Google => GeminiConfig::new(key.to_owned())
            .connect(http)
            .completion(model.strip_prefix("models/").unwrap_or(&model).to_owned())
            .erase(),
        ProviderKind::Deepseek => OpenAIConfig::with_key(&wire::DEEPSEEK, key.to_owned())
            .connect(http)
            .chat(model)
            .erase(),
        ProviderKind::Ollama | ProviderKind::OpenaiCompatible => {
            let base = provider.base_url.clone().ok_or_else(failed)?;
            // Preserve the configured /v1 (or gateway prefix) verbatim; OllamaConfig
            // would append another /v1. Its SDK dialect supports an empty credential.
            let dialect = if provider.kind == ProviderKind::Ollama {
                &wire::OLLAMA
            } else {
                &COMPATIBLE
            };
            OpenAIConfig::with_key(dialect, key.to_owned())
                .with_base_url(base)
                .connect(http)
                .chat(model)
                .erase()
        }
    })
}

pub(super) fn request(
    provider: &ProviderMetadata,
    input: &GenerateRequest,
) -> (CompletionRequest, Vec<String>) {
    let (temperature, warnings) = sampling::temperature(provider, input.temperature);
    let mut request = CompletionRequest::new(input.prompt.clone())
        .max_tokens(u64::from(if provider.kind == ProviderKind::Openai {
            input.max_output_tokens.unwrap_or(4096).max(16)
        } else {
            input.max_output_tokens.unwrap_or(4096)
        }))
        .temperature(temperature);
    if matches!(
        provider.kind,
        ProviderKind::Openai | ProviderKind::Anthropic
    ) {
        // Setting this explicitly enables the vendor catalog checks. Compatible
        // servers own their model capabilities; do not infer them from OpenAI ids.
        request = request.options(GenerationOptions::new().on_unsupported(OnUnsupported::Ignore));
    }
    if let Some(system) = &input.system {
        request = request.preamble(system.clone());
    }
    (request, warnings)
}

pub(super) fn result(
    response: CompletionResponse,
    warnings: Vec<String>,
) -> BackendResult<GenerateResult> {
    if response.error.is_some() || response.aborted.is_some() {
        return Err(failed());
    }
    let reason = match response.finish_reason() {
        Some(FinishReason::Stop) => "stop",
        Some(FinishReason::Length) => "length",
        Some(FinishReason::ToolCalls) => "tool-calls",
        Some(FinishReason::ContentFilter) => "content-filter",
        Some(FinishReason::Other(reason)) if reason == "RECITATION" => "content-filter",
        Some(FinishReason::Other(reason)) if reason == "CONTINUATION" => "length",
        Some(FinishReason::Other(reason))
            if reason.eq_ignore_ascii_case("error")
                || reason.eq_ignore_ascii_case("failed")
                || reason == "MALFORMED_FUNCTION_CALL" =>
        {
            "error"
        }
        Some(_) => "other",
        None => "unknown",
    };
    let text = response.text();
    if text.is_empty() && !matches!(reason, "length" | "content-filter") {
        return Err(failed());
    }
    Ok(GenerateResult {
        text,
        finish_reason: reason.into(),
        usage: TokenUsage {
            input_tokens: response.usage.input_tokens,
            output_tokens: response.usage.output_tokens,
            total_tokens: response.usage.total_tokens,
        },
        warnings,
    })
}
pub(super) fn failed() -> BackendError {
    // Never expose SDK errors: URLs, error envelopes and prompts can contain secrets.
    BackendError::new("AI_GENERATION_FAILED", "AI provider request failed")
}
