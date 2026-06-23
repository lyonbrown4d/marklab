mod composition;
mod grpc_services;

use std::error::Error;
use std::io::Write;
use std::net::SocketAddr;

use composition::WorkspaceCompositionRoot;
use grpc_services::{KnowledgeGrpcService, SessionTokenInterceptor};
use marklab_knowledge_engine_core::WorkspaceEngine;
use marklab_knowledge_grpc_api::v1::{
  control_service_server::ControlServiceServer,
  document_session_service_server::DocumentSessionServiceServer,
  markdown_service_server::MarkdownServiceServer, search_service_server::SearchServiceServer,
};
use serde_json::json;
use tokio::sync::oneshot;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::Server;

type SidecarResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

#[tokio::main]
async fn main() {
  init_tracing();

  if let Err(error) = run().await {
    tracing::error!(%error, "knowledge engine failed");
    std::process::exit(1);
  }
}

async fn run() -> SidecarResult<()> {
  let composition = WorkspaceCompositionRoot::from_env()?;
  let config = composition.config();
  tracing::debug!(
    workspace_root = %config.workspace_root.display(),
    engine_data_dir = %config.engine_data_dir.display(),
    "sidecar composition configured"
  );

  let workspace_engine =
    WorkspaceEngine::open(config.engine_data_dir.clone()).map_err(std::io::Error::other)?;
  let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
  let address = listener.local_addr()?;
  let incoming = TcpListenerStream::new(listener);
  let (shutdown_sender, shutdown_receiver) = oneshot::channel();
  let service = KnowledgeGrpcService::new(
    workspace_engine,
    config.workspace_instance_id.clone(),
    shutdown_sender,
  );
  let interceptor = SessionTokenInterceptor::new(config.grpc_session_token.clone());

  write_ready(&address, &config.workspace_instance_id)?;
  tracing::info!(%address, "knowledge engine grpc server started");

  Server::builder()
    .add_service(ControlServiceServer::with_interceptor(
      service.clone(),
      interceptor.clone(),
    ))
    .add_service(DocumentSessionServiceServer::with_interceptor(
      service.clone(),
      interceptor.clone(),
    ))
    .add_service(MarkdownServiceServer::with_interceptor(
      service.clone(),
      interceptor.clone(),
    ))
    .add_service(SearchServiceServer::with_interceptor(service, interceptor))
    .serve_with_incoming_shutdown(incoming, async {
      let _ = shutdown_receiver.await;
    })
    .await?;

  tracing::info!("knowledge engine grpc server stopped");
  Ok(())
}

fn write_ready(address: &SocketAddr, workspace_instance_id: &str) -> SidecarResult<()> {
  let ready = json!({
    "type": "READY",
    "protocol": "grpc",
    "address": address.to_string(),
    "workspaceInstanceId": workspace_instance_id,
  });
  let stdout = std::io::stdout();
  let mut stdout = stdout.lock();
  serde_json::to_writer(&mut stdout, &ready)?;
  writeln!(stdout)?;
  stdout.flush()?;
  Ok(())
}

fn init_tracing() {
  let filter = tracing_subscriber::EnvFilter::try_from_default_env()
    .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

  tracing_subscriber::fmt()
    .with_env_filter(filter)
    .with_writer(std::io::stderr)
    .with_target(false)
    .compact()
    .init();
}
