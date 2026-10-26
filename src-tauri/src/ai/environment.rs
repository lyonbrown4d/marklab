use super::{ProviderKind, ProviderMetadata, StoredProvider, policy};
use crate::error::{BackendError, BackendResult};
use clap::{Arg, Command, value_parser};
use std::ffi::OsString;

const VENDORS: [(ProviderKind, &str, &str, &[&str], &[&str]); 4] = [
  (
    ProviderKind::Openai,
    "OpenAI",
    "gpt-5-mini",
    &["OPENAI_API_KEY"],
    &["OPENAI_MODEL"],
  ),
  (
    ProviderKind::Anthropic,
    "Anthropic",
    "claude-sonnet-4-6",
    &["ANTHROPIC_API_KEY"],
    &["ANTHROPIC_MODEL"],
  ),
  (
    ProviderKind::Google,
    "Google",
    "gemini-3.5-flash-lite",
    &[
      "GOOGLE_GENERATIVE_AI_API_KEY",
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
    ],
    &["GOOGLE_GENERATIVE_AI_MODEL", "GEMINI_MODEL"],
  ),
  (
    ProviderKind::Deepseek,
    "DeepSeek",
    "deepseek-flash",
    &["DEEPSEEK_API_KEY"],
    &["DEEPSEEK_MODEL"],
  ),
];

// Credentials stay inside the native service and never enter persisted provider metadata.
pub(super) struct EnvironmentProvider {
  pub metadata: StoredProvider,
  api_key: String,
}

pub(super) fn capture() -> BackendResult<Vec<EnvironmentProvider>> {
  let mut command = Command::new("marklab-ai-environment").disable_help_flag(true);
  for (_, _, _, keys, models) in VENDORS {
    for name in keys.iter().chain(models.iter()) {
      command = command.arg(
        Arg::new(*name)
          .long(*name)
          .env(*name)
          .hide_env_values(true)
          .value_parser(value_parser!(OsString)),
      );
    }
  }
  // Only inherited environment is consulted; application/CEF arguments never enter this parser.
  let matches = command
    .try_get_matches_from(["marklab-ai-environment"])
    .map_err(|_| {
      BackendError::new(
        "AI_ENVIRONMENT_INVALID",
        "AI environment configuration could not be read",
      )
    })?;
  Ok(from_lookup(|name| {
    matches
      .get_one::<OsString>(name)
      .and_then(|value| value.to_str())
      .map(str::to_owned)
  }))
}

pub(super) fn from_lookup(read: impl Fn(&str) -> Option<String>) -> Vec<EnvironmentProvider> {
  VENDORS
    .iter()
    .filter_map(|(kind, label, default_model, keys, models)| {
      let api_key = keys.iter().find_map(|name| {
        read(name).filter(|value| !value.trim().is_empty() && value.len() <= 8192)
      })?;
      let model = models
        .iter()
        .find_map(|name| {
          read(name)
            .map(|model| model.trim().to_owned())
            .filter(|model| !model.is_empty() && policy::utf16_len(model) <= 160)
        })
        .unwrap_or_else(|| (*default_model).into());
      let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
      Some(EnvironmentProvider {
        metadata: StoredProvider {
          metadata: ProviderMetadata {
            id: format!("environment.{}", kind.as_str()),
            label: (*label).into(),
            kind: *kind,
            model,
            base_url: None,
          },
          created_at: now.clone(),
          updated_at: now,
          secret_ref: None,
        },
        api_key,
      })
    })
    .collect()
}

impl EnvironmentProvider {
  pub fn key(&self) -> &str {
    &self.api_key
  }
}

pub(super) fn reserved(id: &str) -> bool {
  VENDORS
    .iter()
    .any(|(kind, ..)| id.strip_prefix("environment.") == Some(kind.as_str()))
}

pub(super) fn ensure_mutable(id: &str) -> BackendResult<()> {
  if reserved(id) {
    return Err(BackendError::new(
      "AI_PROVIDER_READ_ONLY",
      "Environment AI provider configuration is managed outside the application",
    ));
  }
  Ok(())
}
