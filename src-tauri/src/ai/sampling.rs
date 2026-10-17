use super::{ProviderKind, ProviderMetadata};
use rig_core::catalog::{Catalog, Sampling};

// Product DTO adaptation only. Rig constructs and decodes every provider request.
pub(super) fn temperature(
    provider: &ProviderMetadata,
    value: Option<f64>,
) -> (Option<f64>, Vec<String>) {
    let Some(value) = value else {
        return (None, vec![]);
    };
    let spec =
        Catalog::builtin().resolve(&format!("{}/{}", provider.kind.as_str(), provider.model));
    let omit = match provider.kind {
        ProviderKind::Openai => {
            // The legacy JS SDK also recognizes future GPT/o-series names absent
            // from the catalog. No reasoning effort is exposed by this product.
            let name = provider.model.as_str();
            let gpt_reasoning = name
                .strip_prefix("gpt-")
                .and_then(|suffix| suffix.split(['.', '-']).next())
                .and_then(|major| major.parse::<u32>().ok())
                .is_some_and(|major| major >= 5)
                && !name.contains("-chat");
            let o_reasoning = name
                .strip_prefix('o')
                .is_some_and(|suffix| suffix.starts_with(|c: char| c.is_ascii_digit()));
            spec.is_some_and(|spec| {
                matches!(
                    spec.sampling,
                    Some(Sampling::Never | Sampling::ReasoningOff)
                )
            }) || gpt_reasoning
                || o_reasoning
        }
        ProviderKind::Anthropic => match spec {
            Some(spec) => spec.sampling == Some(Sampling::Never),
            None => provider.model.starts_with("claude-") && !legacy_claude(&provider.model),
        },
        ProviderKind::Google
        | ProviderKind::Deepseek
        | ProviderKind::OpenaiCompatible
        | ProviderKind::Ollama => false,
    };
    if omit {
        return (
            None,
            vec![
                "temperature was omitted because this model does not support custom sampling"
                    .into(),
            ],
        );
    }
    if provider.kind == ProviderKind::Anthropic && value > 1.0 {
        return (
            Some(1.0),
            vec!["temperature was limited to the Anthropic maximum of 1".into()],
        );
    }
    (Some(value), vec![])
}
fn legacy_claude(model: &str) -> bool {
    [
        "claude-3",
        "claude-2",
        "claude-instant",
        "claude-haiku-4-5",
        "claude-sonnet-4-5",
        "claude-sonnet-4-6",
        "claude-opus-4-1",
        "claude-opus-4-5",
        "claude-opus-4-6",
    ]
    .iter()
    .any(|prefix| model.starts_with(prefix))
        || ["claude-sonnet-4", "claude-opus-4"].iter().any(|prefix| {
            model == *prefix
                || model
                    .strip_prefix(prefix)
                    .is_some_and(|suffix| suffix.starts_with("-20"))
        })
}
