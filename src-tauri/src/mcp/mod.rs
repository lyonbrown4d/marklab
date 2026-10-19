mod adapter;
mod config;
mod server;
mod types;

use crate::error::{BackendError, BackendResult};
use rmcp::{ServiceExt, service::QuitReason};
use std::{ffi::OsString, sync::Arc};

/// Serve the explicit CLI workspace over SDK stdio, without initializing Tauri.
pub async fn run(arguments: impl IntoIterator<Item = OsString>) -> BackendResult<()> {
  let config = config::Config::parse(arguments, |name| std::env::var_os(name))?;
  let adapter = Arc::new(adapter::Adapter::open(config).await?);
  let service = match server::Server::new(adapter.clone())
    .serve(rmcp::transport::stdio())
    .await
  {
    Ok(service) => service,
    Err(_) => {
      adapter.close().await;
      return Err(BackendError::new(
        "MCP_TRANSPORT_FAILED",
        "Cannot initialize MCP stdio transport; connect an MCP client",
      ));
    }
  };
  let result = service.waiting().await;
  adapter.close().await;
  match result {
    Ok(QuitReason::Closed | QuitReason::Cancelled) => Ok(()),
    _ => Err(BackendError::new(
      "MCP_TRANSPORT_FAILED",
      "MCP stdio transport failed",
    )),
  }
}

#[cfg(test)]
mod config_tests;
#[cfg(test)]
mod tests;
