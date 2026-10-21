use super::{
  AiService, GenerateRequest, GenerationEvent, InlineRequest, Job, StartResult, policy, prompt,
};
use crate::desktop::event_contracts::{AI_COMPLETION, AI_GENERATION};
use crate::native_window::TrustedWindow as WebviewWindow;
use crate::{
  error::{BackendError, BackendResult},
  settings::SettingsStore,
};
use tauri::Manager;
use tokio_util::sync::CancellationToken;
impl AiService {
  pub async fn start_generation(
    &self,
    window: WebviewWindow,
    request: GenerateRequest,
    inline: Option<InlineRequest>,
  ) -> BackendResult<StartResult> {
    policy::validate_generate(&request)?;
    let workspace = window
      .state::<crate::workspace::WorkspaceRegistry>()
      .get(window.label())?;
    let request_id = uuid::Uuid::new_v4().to_string();
    let channel = if inline.is_some() {
      AI_COMPLETION
    } else {
      AI_GENERATION
    };
    let session = inline
      .as_ref()
      .map(|input| input.completion_session_id.clone());
    let cancel = CancellationToken::new();
    let cancelled = cancel.clone();
    let mut jobs = self.inner.jobs.lock().await;
    window
      .state::<crate::workspace::WorkspaceRegistry>()
      .ensure_binding(window.label(), &workspace)?;
    if let Some(session) = &session {
      let previous = jobs
        .iter()
        .filter(|(_, job)| job.owner == window.label() && job.session.as_ref() == Some(session))
        .map(|(id, _)| id.clone())
        .collect::<Vec<_>>();
      for id in previous {
        if let Some(job) = jobs.remove(&id) {
          job.cancel.cancel();
          let _ = job.channel.emit_to(
            window.app_handle(),
            tauri::EventTarget::webview_window(window.label()),
            &GenerationEvent::Cancelled { request_id: id },
          );
        }
      }
    }
    if jobs.len() >= 8
      || (inline.is_some()
        && jobs
          .values()
          .filter(|job| job.owner == window.label() && job.session.is_some())
          .count()
          >= 3)
    {
      return Err(BackendError::new(
        "AI_QUEUE_FULL",
        "AI generation queue is full",
      ));
    }
    jobs.insert(
      request_id.clone(),
      Job {
        owner: window.label().into(),
        session,
        channel,
        cancel,
      },
    );
    drop(jobs);
    let service = self.clone();
    let id = request_id.clone();
    tauri::async_runtime::spawn(async move {
      tokio::task::yield_now().await;
      let result = tokio::select! {biased;_=cancelled.cancelled()=>None,result=service.generate(request)=>Some(result)};
      let mut jobs = service.inner.jobs.lock().await;
      if jobs.remove(&id).is_none() {
        return;
      }
      // Keep job ownership locked through emission so cancellation cannot race a finish event.
      match result {
        Some(Ok(mut result)) => {
          if let Some(input) = inline {
            result.text = prompt::clean(&result.text, &input);
          }
          if !result.text.is_empty() {
            let _ = channel.emit_to(
              window.app_handle(),
              tauri::EventTarget::webview_window(window.label()),
              &GenerationEvent::Delta {
                request_id: id.clone(),
                delta: result.text,
              },
            );
          }
          let _ = channel.emit_to(
            window.app_handle(),
            tauri::EventTarget::webview_window(window.label()),
            &GenerationEvent::Finish {
              request_id: id,
              finish_reason: result.finish_reason,
              usage: result.usage,
              warnings: result.warnings,
            },
          );
        }
        Some(Err(_)) => {
          let _ = channel.emit_to(
            window.app_handle(),
            tauri::EventTarget::webview_window(window.label()),
            &GenerationEvent::Error {
              request_id: id,
              message: "AI provider request failed".into(),
            },
          );
        }
        None => {}
      }
    });
    Ok(StartResult { request_id })
  }
  pub async fn start_inline(
    &self,
    window: WebviewWindow,
    settings: &SettingsStore,
    input: InlineRequest,
  ) -> BackendResult<StartResult> {
    prompt::validate(&input)?;
    let attempt = uuid::Uuid::new_v4().to_string();
    let key = (
      window.label().to_string(),
      input.completion_session_id.clone(),
    );
    {
      let mut attempts = self.inner.attempts.lock().await;
      window
        .state::<crate::workspace::WorkspaceRegistry>()
        .get(window.label())?;
      if attempts.len() >= 8 && !attempts.contains_key(&key) {
        return Err(BackendError::new(
          "AI_QUEUE_FULL",
          "AI generation queue is full",
        ));
      }
      attempts.insert(key.clone(), attempt.clone());
    }
    self
      .cancel_inline_session(&window, &input.completion_session_id)
      .await;
    let allowed = async {
      let provider = self.stored_provider(&input.provider_id).await?;
      if !policy::local(&provider.metadata) {
        let preferences = settings.read_setting("marklab.preferences").await?;
        if !preferences.is_some_and(|value| {
          value
            .state
            .get("aiCompletionCloudContextConsent")
            .and_then(serde_json::Value::as_bool)
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
    .await;
    // Reserve the attempt before policy I/O so an older request cannot overtake a newer one.
    let mut attempts = self.inner.attempts.lock().await;
    if attempts.get(&key) != Some(&attempt) {
      return Err(BackendError::new(
        "AI_SUPERSEDED",
        "AI inline completion request was superseded",
      ));
    }
    if let Err(error) = allowed {
      attempts.remove(&key);
      return Err(error);
    }
    let result = self
      .start_generation(window, prompt::build(&input), Some(input))
      .await;
    attempts.remove(&key);
    result
  }

  pub async fn cancel(&self, window: &WebviewWindow, id: &str) -> BackendResult<()> {
    uuid::Uuid::parse_str(id).map_err(|_| policy::invalid("Invalid AI request ID"))?;
    let mut jobs = self.inner.jobs.lock().await;
    if jobs.get(id).is_some_and(|job| job.owner == window.label())
      && let Some(job) = jobs.remove(id)
    {
      job.cancel.cancel();
      let _ = job.channel.emit_to(
        window.app_handle(),
        tauri::EventTarget::webview_window(window.label()),
        &GenerationEvent::Cancelled {
          request_id: id.into(),
        },
      );
    }
    Ok(())
  }
  async fn cancel_inline_session(&self, window: &WebviewWindow, session: &str) {
    let mut jobs = self.inner.jobs.lock().await;
    let ids = jobs
      .iter()
      .filter(|(_, job)| job.owner == window.label() && job.session.as_deref() == Some(session))
      .map(|(id, _)| id.clone())
      .collect::<Vec<_>>();
    for id in ids {
      if let Some(job) = jobs.remove(&id) {
        job.cancel.cancel();
        let _ = job.channel.emit_to(
          window.app_handle(),
          tauri::EventTarget::webview_window(window.label()),
          &GenerationEvent::Cancelled { request_id: id },
        );
      }
    }
  }
  pub async fn cancel_owner(&self, owner: &str) {
    let mut jobs = self.inner.jobs.lock().await;
    let ids = jobs
      .iter()
      .filter(|(_, job)| job.owner == owner)
      .map(|(id, _)| id.clone())
      .collect::<Vec<_>>();
    for id in ids {
      if let Some(job) = jobs.remove(&id) {
        job.cancel.cancel();
      }
    }
    drop(jobs);
    self
      .inner
      .attempts
      .lock()
      .await
      .retain(|(label, _), _| label != owner);
  }
}
