use super::secrets::SecretUpdate;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderKind {
  Openai,
  Anthropic,
  Google,
  Deepseek,
  OpenaiCompatible,
  Ollama,
}
impl ProviderKind {
  pub const fn as_str(self) -> &'static str {
    match self {
      Self::Openai => "openai",
      Self::Anthropic => "anthropic",
      Self::Google => "google",
      Self::Deepseek => "deepseek",
      Self::OpenaiCompatible => "openai-compatible",
      Self::Ollama => "ollama",
    }
  }
}
#[derive(Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderMetadata {
  pub id: String,
  pub label: String,
  pub kind: ProviderKind,
  pub model: String,
  #[serde(default, skip_serializing_if = "Option::is_none")]
  pub base_url: Option<String>,
}
#[derive(Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderUpdate {
  pub id: String,
  pub label: String,
  pub kind: ProviderKind,
  pub model: String,
  #[serde(default)]
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
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ProviderLocality {
  Local,
  Remote,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum ApiKeySource {
  Stored,
  Environment,
  None,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct PublicProvider {
  #[serde(flatten)]
  pub metadata: ProviderMetadata,
  pub created_at: String,
  pub updated_at: String,
  pub locality: ProviderLocality,
  pub available: bool,
  pub requires_api_key: bool,
  pub has_api_key: bool,
  pub api_key_source: ApiKeySource,
  pub masked_api_key: Option<&'static str>,
}
#[derive(Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateRequest {
  #[serde(skip)]
  pub(crate) require_context_consent: bool,
  pub provider_id: String,
  pub prompt: String,
  #[serde(default)]
  pub system: Option<String>,
  #[serde(default)]
  pub max_output_tokens: Option<u32>,
  #[serde(default)]
  pub temperature: Option<f64>,
}
#[derive(Clone, Default, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsage {
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(default, with = "crate::ipc_number")]
  #[specta(type = Option<u64>)]
  pub input_tokens: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(default, with = "crate::ipc_number")]
  #[specta(type = Option<u64>)]
  pub output_tokens: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  #[serde(default, with = "crate::ipc_number")]
  #[specta(type = Option<u64>)]
  pub total_tokens: Option<u64>,
}
#[derive(Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
  pub text: String,
  pub finish_reason: String,
  pub usage: TokenUsage,
  pub warnings: Vec<String>,
}
pub use AiIdRequest as IdRequest;
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct AiIdRequest {
  pub id: String,
}
pub use AiCancelRequest as CancelRequest;
#[derive(Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AiCancelRequest {
  pub request_id: String,
}
pub use AiEmptyRequest as EmptyRequest;
#[derive(Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct AiEmptyRequest {}
pub use AiOkResult as OkResult;
#[derive(Serialize, specta::Type)]
pub struct AiOkResult {
  pub ok: bool,
}
#[derive(Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StartResult {
  pub request_id: String,
}
#[derive(Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InlineRequest {
  pub provider_id: String,
  pub completion_session_id: String,
  pub revision: u32,
  pub prefix: String,
  pub suffix: String,
  #[serde(default)]
  pub heading: Option<String>,
  pub language: String,
  pub length: String,
  pub excluded_suggestions: Vec<String>,
}
#[derive(Clone, Serialize, specta::Type)]
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
