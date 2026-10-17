use super::secrets::SecretUpdate;
use serde::{Deserialize, Serialize};
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderMetadata {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub model: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderUpdate {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub model: String,
    pub base_url: Option<String>,
    #[serde(default)]
    pub api_key: SecretUpdate,
}
#[derive(Clone)]
pub struct StoredProvider {
    pub metadata: ProviderMetadata,
    pub created_at: String,
    pub updated_at: String,
    pub secret_ref: Option<String>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicProvider {
    #[serde(flatten)]
    pub metadata: ProviderMetadata,
    pub created_at: String,
    pub updated_at: String,
    pub locality: &'static str,
    pub available: bool,
    pub requires_api_key: bool,
    pub has_api_key: bool,
    pub api_key_source: &'static str,
    pub masked_api_key: Option<&'static str>,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateRequest {
    #[serde(skip)]
    pub(crate) require_context_consent: bool,
    pub provider_id: String,
    pub prompt: String,
    pub system: Option<String>,
    pub max_output_tokens: Option<u32>,
    pub temperature: Option<f64>,
}
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_tokens: Option<u64>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    pub text: String,
    pub finish_reason: String,
    pub usage: TokenUsage,
    pub warnings: Vec<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdRequest {
    pub id: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CancelRequest {
    pub request_id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct EmptyRequest {}
#[derive(Serialize)]
pub struct OkResult {
    pub ok: bool,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
    pub request_id: String,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InlineRequest {
    pub provider_id: String,
    pub completion_session_id: String,
    pub revision: u32,
    pub prefix: String,
    pub suffix: String,
    pub heading: Option<String>,
    pub language: String,
    pub length: String,
    pub excluded_suggestions: Vec<String>,
}
#[derive(Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum GenerationEvent {
    Delta {
        #[serde(rename = "requestId")]
        request_id: String,
        delta: String,
    },
    Finish {
        #[serde(rename = "requestId")]
        request_id: String,
        #[serde(rename = "finishReason")]
        finish_reason: String,
        usage: TokenUsage,
        warnings: Vec<String>,
    },
    Error {
        #[serde(rename = "requestId")]
        request_id: String,
        message: String,
    },
    Cancelled {
        #[serde(rename = "requestId")]
        request_id: String,
    },
}
