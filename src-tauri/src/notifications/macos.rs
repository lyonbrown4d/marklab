use super::{EventHandler, NativeMessage};
use crate::error::BackendResult;
use objc2::rc::Retained;
use std::sync::Arc;

#[path = "macos_delegate.rs"]
mod delegate;
#[path = "macos_native.rs"]
mod native;

pub(super) struct Backend {
  app: tauri::AppHandle,
  delegate: Retained<delegate::Delegate>,
  tokens: Arc<delegate::Tokens>,
  operation: tokio::sync::Mutex<()>,
}

impl Backend {
  pub fn new(app: &tauri::AppHandle, events: EventHandler) -> BackendResult<Self> {
    let tokens = Arc::new(delegate::Tokens::default());
    Ok(Self {
      app: app.clone(),
      delegate: delegate::Delegate::new(tokens.clone(), events),
      tokens,
      operation: tokio::sync::Mutex::new(()),
    })
  }

  pub async fn prepare(&self) -> BackendResult<()> {
    let _operation = self.operation.lock().await;
    native::authorize(&self.app, self.delegate.clone()).await
  }

  pub async fn show(&self, message: &NativeMessage) -> BackendResult<()> {
    let _operation = self.operation.lock().await;
    if let Some(previous) = self.tokens.get(&message.id)? {
      native::remove(&self.app, previous.clone()).await?;
      self.tokens.take(&previous);
    }
    self.tokens.replace(&message.id, &message.token)?;
    let result = native::show(&self.app, message, self.tokens.clone()).await;
    if result.is_err()
      && self.tokens.contains(&message.token)
      && native::remove(&self.app, message.token.clone())
        .await
        .is_ok()
    {
      self.tokens.take(&message.token);
    }
    result
  }

  pub async fn close(&self, id: &str) -> BackendResult<()> {
    let _operation = self.operation.lock().await;
    if let Some(token) = self.tokens.get(id)? {
      native::remove(&self.app, token.clone()).await?;
      self.tokens.take(&token);
    }
    Ok(())
  }
}
