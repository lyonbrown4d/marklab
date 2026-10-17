use super::{secrets::SecretUpdate, types::*};
use crate::error::{BackendError, BackendResult};
use std::net::IpAddr;
use url::Url;
pub fn invalid(message: &str) -> BackendError {
    BackendError::new("INVALID_AI_REQUEST", message)
}
pub fn validate_id(id: &str) -> BackendResult<()> {
    if id.is_empty()
        || id.len() > 64
        || !id.as_bytes()[0].is_ascii_alphanumeric()
        || !id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b"._-".contains(&c))
    {
        return Err(invalid("Invalid provider ID"));
    }
    Ok(())
}
pub fn loopback(url: &Url) -> bool {
    url.host_str().is_some_and(|host| {
        host.eq_ignore_ascii_case("localhost")
            || host
                .trim_matches(['[', ']'])
                .parse::<IpAddr>()
                .is_ok_and(|ip| ip.is_loopback())
    })
}
pub fn normalize_update(input: &mut ProviderUpdate) -> BackendResult<()> {
    validate_id(&input.id)?;
    input.label = input.label.trim().into();
    input.model = input.model.trim().into();
    if input.label.is_empty()
        || utf16_len(&input.label) > 80
        || input.model.is_empty()
        || utf16_len(&input.model) > 160
    {
        return Err(invalid("Invalid provider metadata"));
    }
    if let SecretUpdate::Set(key) = &input.api_key
        && (key.trim().is_empty() || key.len() > 8192)
    {
        return Err(invalid("Invalid API key"));
    }
    let custom = matches!(
        input.kind,
        ProviderKind::Ollama | ProviderKind::OpenaiCompatible
    );
    match &input.base_url {
        None if custom => return Err(invalid("This provider requires baseUrl")),
        Some(_) if !custom => {
            return Err(invalid("This provider does not accept a custom baseUrl"));
        }
        Some(value) => {
            if value.len() > 2048 {
                return Err(invalid("Provider base URL is too long"));
            }
            let url = Url::parse(value).map_err(|_| invalid("Invalid provider base URL"))?;
            if !["https", "http"].contains(&url.scheme())
                || !url.username().is_empty()
                || url.password().is_some()
                || url.query().is_some()
                || url.fragment().is_some()
                || url.host_str().is_none()
                || (url.scheme() == "http" && !loopback(&url))
                || (input.kind == ProviderKind::Ollama && !loopback(&url))
            {
                return Err(invalid(
                    "Provider URL must use HTTPS or loopback HTTP without credentials, queries or fragments",
                ));
            }
            input.base_url = Some(url.to_string().trim_end_matches('/').into());
        }
        _ => {}
    }
    Ok(())
}
pub(super) fn validate_stored(provider: &StoredProvider, id: &str) -> BackendResult<()> {
    let mut input = ProviderUpdate {
        id: provider.metadata.id.clone(),
        label: provider.metadata.label.clone(),
        kind: provider.metadata.kind,
        model: provider.metadata.model.clone(),
        base_url: provider.metadata.base_url.clone(),
        api_key: SecretUpdate::Unchanged,
    };
    normalize_update(&mut input)?;
    if provider.metadata.id != id
        || chrono::DateTime::parse_from_rfc3339(&provider.created_at).is_err()
        || chrono::DateTime::parse_from_rfc3339(&provider.updated_at).is_err()
        || provider.secret_ref.as_deref().is_some_and(|reference| {
            !reference
                .strip_prefix("ai:")
                .is_some_and(|id| uuid::Uuid::parse_str(id).is_ok())
        })
    {
        return Err(invalid("Stored AI provider configuration is invalid"));
    }
    Ok(())
}
pub(super) fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}
pub fn local(provider: &ProviderMetadata) -> bool {
    provider.kind == ProviderKind::Ollama
        || (provider.kind == ProviderKind::OpenaiCompatible
            && provider
                .base_url
                .as_deref()
                .and_then(|url| Url::parse(url).ok())
                .is_some_and(|url| loopback(&url)))
}
pub fn environment_key(kind: ProviderKind) -> Option<String> {
    let name = match kind {
        ProviderKind::Openai => "OPENAI_API_KEY",
        ProviderKind::Anthropic => "ANTHROPIC_API_KEY",
        ProviderKind::Google => "GOOGLE_GENERATIVE_AI_API_KEY",
        ProviderKind::Deepseek => "DEEPSEEK_API_KEY",
        ProviderKind::Ollama | ProviderKind::OpenaiCompatible => return None,
    };
    std::env::var(name)
        .ok()
        .filter(|value| !value.trim().is_empty())
}
pub fn public(provider: StoredProvider) -> PublicProvider {
    let locality = if local(&provider.metadata) {
        "local"
    } else {
        "remote"
    };
    let requires_api_key = locality != "local";
    let source = if provider.secret_ref.is_some() {
        "stored"
    } else if environment_key(provider.metadata.kind).is_some() {
        "environment"
    } else {
        "none"
    };
    PublicProvider {
        metadata: provider.metadata,
        created_at: provider.created_at,
        updated_at: provider.updated_at,
        locality,
        available: source != "none" || !requires_api_key,
        requires_api_key,
        has_api_key: source != "none",
        api_key_source: source,
        masked_api_key: if source == "none" {
            None
        } else {
            Some("••••••••")
        },
    }
}
pub fn validate_generate(request: &GenerateRequest) -> BackendResult<()> {
    validate_id(&request.provider_id)?;
    if request.prompt.is_empty()
        || utf16_len(&request.prompt) > 100_000
        || request
            .system
            .as_ref()
            .is_some_and(|system| utf16_len(system) > 50_000)
        || request
            .max_output_tokens
            .is_some_and(|tokens| !(1..=32768).contains(&tokens))
        || request
            .temperature
            .is_some_and(|value| !value.is_finite() || !(0.0..=2.0).contains(&value))
    {
        return Err(invalid("Invalid generation request"));
    }
    Ok(())
}
