use super::{AiService, GenerateRequest, GenerateResult, sdk, transport::BoundedTransport};
use crate::error::{BackendError, BackendResult};
use rig_core::{
    completion::{CompletionRequest, CompletionResponse},
    driver::DynModel,
    error::ProviderError,
    operation::Completion,
};
use serde_json::Value;
use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tokio::time::Instant;

impl AiService {
    pub async fn generate(&self, request: GenerateRequest) -> BackendResult<GenerateResult> {
        self.generate_with_retries(request, 1).await
    }
    async fn generate_with_retries(
        &self,
        request: GenerateRequest,
        retries: u8,
    ) -> BackendResult<GenerateResult> {
        super::policy::validate_generate(&request)?;
        // One deadline covers queueing, credential/policy I/O, every attempt and body.
        tokio::time::timeout(Duration::from_secs(120), async {
            let _slot =
                self.inner.queue.clone().try_acquire_owned().map_err(|_| {
                    BackendError::new("AI_QUEUE_FULL", "AI generation queue is full")
                })?;
            let _worker = self
                .inner
                .workers
                .acquire()
                .await
                .map_err(|_| sdk::failed())?;
            let (provider, key) = {
                // Keep the row and its secret reference coherent with update/delete.
                // Release this short configuration guard before any vendor I/O.
                let _configuration = self.inner.mutation.lock().await;
                let provider = self.stored_provider(&request.provider_id).await?;
                self.check_consent(&provider.metadata, request.require_context_consent)
                    .await?;
                let key = self.provider_key(&provider).await?;
                (provider, key)
            };
            let transport = BoundedTransport::new(self.inner.client.clone());
            let exceeded = transport.exceeded.clone();
            let model = sdk::model(&provider.metadata, &key, transport)?;
            let (input, warnings) = sdk::request(&provider.metadata, &request);
            match call_with_retry(&model, input, exceeded, retries, Duration::from_secs(120)).await
            {
                Ok(response) => sdk::result(response, warnings),
                Err(CallError::Provider(error))
                    if error.provider_response().is_some_and(|reply| reply.refusal) =>
                {
                    Ok(GenerateResult {
                        text: String::new(),
                        finish_reason: "content-filter".into(),
                        usage: Default::default(),
                        warnings,
                    })
                }
                Err(CallError::Timeout) => Err(timeout()),
                Err(_) => Err(sdk::failed()),
            }
        })
        .await
        .map_err(|_| timeout())?
    }
    pub(super) async fn check_consent(
        &self,
        provider: &super::ProviderMetadata,
        required: bool,
    ) -> BackendResult<()> {
        if required && !super::policy::local(provider) {
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
        Ok(())
    }
    pub async fn test_provider(&self, id: &str) -> BackendResult<()> {
        self.generate_with_retries(
            GenerateRequest {
                require_context_consent: false,
                provider_id: id.into(),
                prompt: "Reply with OK.".into(),
                system: None,
                max_output_tokens: Some(8),
                temperature: None,
            },
            0,
        )
        .await?;
        Ok(())
    }
}
#[derive(Debug)]
pub(super) enum CallError {
    Provider(Box<ProviderError>),
    Timeout,
    TooLarge,
}
pub(super) async fn call_with_retry(
    model: &DynModel<Completion>,
    request: CompletionRequest,
    exceeded: Arc<AtomicBool>,
    retries: u8,
    budget: Duration,
) -> Result<CompletionResponse, CallError> {
    let deadline = Instant::now() + budget;
    for attempt in 0..=retries.min(1) {
        let result = tokio::time::timeout_at(deadline, model.call(request.clone()))
            .await
            .map_err(|_| CallError::Timeout)?;
        match result {
            Ok(response) => return Ok(response),
            Err(_) if exceeded.load(Ordering::Acquire) => return Err(CallError::TooLarge),
            Err(error) => {
                if attempt >= retries.min(1) || !retryable(&error) {
                    return Err(CallError::Provider(Box::new(error)));
                }
                tokio::time::timeout_at(deadline, tokio::time::sleep(retry_delay(&error)))
                    .await
                    .map_err(|_| CallError::Timeout)?;
            }
        }
    }
    Err(CallError::Timeout)
}
fn retryable(error: &ProviderError) -> bool {
    // Original AI SDK treats 409 as retryable in addition to Rig's classification.
    error.is_retryable()
        || error
            .provider_response_status()
            .is_some_and(|status| status.as_u16() == 409)
}
fn retry_delay(error: &ProviderError) -> Duration {
    let headers = error.provider_response_headers();
    let value = |name| {
        headers
            .and_then(|headers| headers.get(name))
            .and_then(|value| value.to_str().ok())
    };
    let millis = value("retry-after-ms")
        .and_then(|value| value.parse::<f64>().ok())
        .map(|value| value / 1000.0);
    let seconds = millis.or_else(|| {
        value("retry-after").and_then(|value| {
            value.parse::<f64>().ok().or_else(|| {
                chrono::DateTime::parse_from_rfc2822(value)
                    .ok()
                    .map(|date| {
                        (date.with_timezone(&chrono::Utc) - chrono::Utc::now()).num_milliseconds()
                            as f64
                            / 1000.0
                    })
            })
        })
    });
    seconds
        .filter(|value| value.is_finite() && *value >= 0.0 && *value <= 60.0)
        .map(Duration::from_secs_f64)
        .unwrap_or(Duration::from_secs(2))
}
fn timeout() -> BackendError {
    BackendError::new("AI_TIMEOUT", "AI provider request timed out")
}
