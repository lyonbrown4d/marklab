use super::*;
use crate::{database::Database, error::BackendResult};
use serde_json::json;
#[tokio::test]
async fn provider_metadata_is_durable_redacted_and_url_policies_are_enforced() -> BackendResult<()>
{
    let directory = tempfile::tempdir()?;
    let database = Database::open(directory.path()).await?;
    let service = AiService::new(database.pool.clone()).await?;
    let input = serde_json::from_value(
        json!({"id":"local","label":"Local","kind":"ollama","model":"model","baseUrl":"http://127.0.0.1:11434/v1/"}),
    )?;
    let provider = service.update_provider(input).await?;
    assert_eq!(provider.locality, "local");
    assert!(provider.available);
    assert!(!provider.requires_api_key);
    let public = serde_json::to_value(&provider)?;
    assert!(!public.as_object().unwrap().contains_key("secretRef"));
    assert!(!public.as_object().unwrap().contains_key("apiKey"));
    assert_eq!(
        provider.metadata.base_url.as_deref(),
        Some("http://127.0.0.1:11434/v1")
    );
    for input in [
        json!({"id":"bad","label":"Bad","kind":"ollama","model":"m","baseUrl":"https://example.com"}),
        json!({"id":"bad","label":"Bad","kind":"openai-compatible","model":"m","baseUrl":"http://example.com"}),
        json!({"id":"bad","label":"Bad","kind":"openai","model":"m","baseUrl":"https://example.com"}),
    ] {
        assert!(
            service
                .update_provider(serde_json::from_value(input)?)
                .await
                .is_err()
        );
    }
    assert_eq!(service.list_providers().await?.len(), 1);
    service.delete_provider("local").await?;
    assert!(service.list_providers().await?.is_empty());
    database.pool.close().await;
    Ok(())
}
#[test]
fn inline_context_remains_untrusted_and_cleanup_preserves_continuations() {
    let input:InlineRequest=serde_json::from_value(json!({"providerId":"local","completionSessionId":"s","revision":1,"prefix":"context\nHello ","suffix":".\nreference","language":"auto","length":"short","excludedSuggestions":["no"]})).unwrap();
    prompt::validate(&input).unwrap();
    let request = prompt::build(&input);
    assert!(request.prompt.contains("UNTRUSTED_DOCUMENT_DATA_START"));
    assert!(request.prompt.contains("contextBefore"));
    assert_eq!(request.max_output_tokens, Some(48));
    assert_eq!(prompt::clean("```text\nHello world\n```", &input), "world");
    assert_eq!(prompt::clean("\"no\"", &input), "");
    assert_eq!(prompt::clean("a\0b\r\nc", &input), "ab\nc");
}
