use std::error::Error;
use std::io;
use std::io::Write;
use std::net::SocketAddr;
use std::path::PathBuf;

use clap::Parser;
use figment2::{
  providers::{Env, Serialized},
  Figment, Provider as FigmentProvider,
};
use fluxdi::{
  Application, Error as FluxError, ErrorKind as FluxErrorKind, Injector, Module, Provider, Shared,
};
use marklab_knowledge_engine_core::WorkspaceEngine;
use marklab_knowledge_grpc_api::v1::{
  control_service_server::ControlServiceServer,
  document_session_service_server::DocumentSessionServiceServer,
  markdown_service_server::MarkdownServiceServer, search_service_server::SearchServiceServer,
  workspace_service_server::WorkspaceServiceServer,
  workspace_vfs_service_server::WorkspaceVfsServiceServer,
};
use marklab_knowledge_workspace_vfs::WorkspaceVfs;
use serde_json::json;
use tokio::sync::oneshot;
use tokio_stream::wrappers::TcpListenerStream;
use tonic::transport::Server;

use crate::grpc_services::{KnowledgeGrpcService, SessionTokenInterceptor};

type SidecarResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

const CONFIG_ENV_KEYS: &[&str] = &[
  "workspace_instance_id",
  "workspace_root",
  "engine_data_dir",
  "grpc_session_token",
];

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
pub(crate) struct WorkspaceCompositionConfig {
  pub(crate) workspace_instance_id: String,
  pub(crate) workspace_root: PathBuf,
  pub(crate) engine_data_dir: PathBuf,
  pub(crate) grpc_session_token: String,
}

#[derive(Debug, Clone)]
pub(crate) struct WorkspaceCompositionRoot {
  config: WorkspaceCompositionConfig,
}

impl WorkspaceCompositionRoot {
  pub(crate) fn from_cli() -> io::Result<Self> {
    Self::from_args(WorkspaceSidecarArgs::parse())
  }

  fn from_args(args: WorkspaceSidecarArgs) -> io::Result<Self> {
    let config = load_config(args)?;

    tracing::debug!(
      workspace_instance_id = %config.workspace_instance_id,
      "created grpc sidecar composition root"
    );

    Ok(Self { config })
  }

  pub(crate) async fn bootstrap(self) -> Result<(), FluxError> {
    let mut application = Application::new(KnowledgeEngineModule {
      config: self.config,
    });

    application.bootstrap().await
  }

  #[cfg(test)]
  pub(crate) fn config(&self) -> &WorkspaceCompositionConfig {
    &self.config
  }
}

#[derive(Debug, Clone, Parser)]
#[command(name = "knowledge-engine")]
struct WorkspaceSidecarArgs {
  #[arg(long)]
  workspace_instance_id: Option<String>,
  #[arg(long)]
  workspace_root: Option<PathBuf>,
  #[arg(long)]
  engine_data_dir: Option<PathBuf>,
  #[arg(long)]
  grpc_session_token: Option<String>,
}

#[derive(Debug, serde::Serialize)]
struct PartialWorkspaceCompositionConfig {
  #[serde(skip_serializing_if = "Option::is_none")]
  workspace_instance_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  workspace_root: Option<PathBuf>,
  #[serde(skip_serializing_if = "Option::is_none")]
  engine_data_dir: Option<PathBuf>,
  #[serde(skip_serializing_if = "Option::is_none")]
  grpc_session_token: Option<String>,
}

impl PartialWorkspaceCompositionConfig {
  fn defaults() -> Self {
    Self {
      workspace_instance_id: None,
      workspace_root: None,
      engine_data_dir: None,
      grpc_session_token: None,
    }
  }
}
impl From<WorkspaceSidecarArgs> for PartialWorkspaceCompositionConfig {
  fn from(args: WorkspaceSidecarArgs) -> Self {
    Self {
      workspace_instance_id: args.workspace_instance_id,
      workspace_root: args.workspace_root,
      engine_data_dir: args.engine_data_dir,
      grpc_session_token: args.grpc_session_token,
    }
  }
}

fn load_config(args: WorkspaceSidecarArgs) -> io::Result<WorkspaceCompositionConfig> {
  load_config_from(args, filtered_env())
}

fn load_config_from<T: FigmentProvider>(
  args: WorkspaceSidecarArgs,
  source: T,
) -> io::Result<WorkspaceCompositionConfig> {
  Figment::from(Serialized::defaults(
    PartialWorkspaceCompositionConfig::defaults(),
  ))
  .merge(source)
  .merge(Serialized::defaults(
    PartialWorkspaceCompositionConfig::from(args),
  ))
  .extract::<WorkspaceCompositionConfig>()
  .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error.to_string()))
}

fn filtered_env() -> Env {
  Env::raw().ignore_empty(true).only(CONFIG_ENV_KEYS)
}

struct KnowledgeEngineModule {
  config: WorkspaceCompositionConfig,
}

impl Module for KnowledgeEngineModule {
  fn configure(&self, injector: &Injector) -> Result<(), FluxError> {
    let config = self.config.clone();
    let server_config = self.config.clone();

    injector.try_provide::<WorkspaceCompositionConfig>(Provider::root(move |_| {
      Shared::new(config.clone())
    }))?;

    injector.try_provide::<KnowledgeGrpcServer>(Provider::root(move |_| {
      Shared::new(KnowledgeGrpcServer::new(server_config.clone()))
    }))?;

    Ok(())
  }

  fn on_start(&self, injector: Shared<Injector>) -> fluxdi::module::ModuleLifecycleFuture {
    Box::pin(async move {
      let server = injector.try_resolve::<KnowledgeGrpcServer>()?;
      server.serve().await.map_err(lifecycle_error)
    })
  }
}

#[derive(Debug)]
struct KnowledgeGrpcServer {
  config: WorkspaceCompositionConfig,
}

impl KnowledgeGrpcServer {
  fn new(config: WorkspaceCompositionConfig) -> Self {
    Self { config }
  }

  async fn serve(&self) -> SidecarResult<()> {
    let config = &self.config;
    tracing::debug!(
      workspace_root = %config.workspace_root.display(),
      engine_data_dir = %config.engine_data_dir.display(),
      "sidecar composition configured"
    );

    let workspace_engine =
      WorkspaceEngine::open(config.engine_data_dir.clone()).map_err(std::io::Error::other)?;
    let workspace_vfs = WorkspaceVfs::open(config.workspace_root.clone())
      .await
      .map_err(std::io::Error::other)?;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let incoming = TcpListenerStream::new(listener);
    let (shutdown_sender, shutdown_receiver) = oneshot::channel();
    let service = KnowledgeGrpcService::new(
      workspace_engine,
      workspace_vfs,
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
      .add_service(WorkspaceServiceServer::with_interceptor(
        service.clone(),
        interceptor.clone(),
      ))
      .add_service(WorkspaceVfsServiceServer::with_interceptor(
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

fn lifecycle_error(error: Box<dyn Error + Send + Sync>) -> FluxError {
  FluxError::new(
    FluxErrorKind::ModuleLifecycleFailed,
    format!("knowledge engine grpc server failed: {error}"),
  )
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keeps_workspace_configuration_inside_binary_boundary() {
    let root = WorkspaceCompositionRoot {
      config: load_config_from(
        WorkspaceSidecarArgs {
          workspace_instance_id: Some("workspace-a".to_string()),
          workspace_root: Some(PathBuf::from("/workspace")),
          engine_data_dir: Some(PathBuf::from("/data")),
          grpc_session_token: None,
        },
        Serialized::defaults(PartialWorkspaceCompositionConfig {
          workspace_instance_id: Some("env-workspace".to_string()),
          workspace_root: Some(PathBuf::from("/env-workspace")),
          engine_data_dir: Some(PathBuf::from("/env-data")),
          grpc_session_token: Some("token".to_string()),
        }),
      )
      .expect("config should be valid"),
    };

    assert_eq!(root.config().workspace_instance_id, "workspace-a");
    assert_eq!(root.config().workspace_root, PathBuf::from("/workspace"));
    assert_eq!(root.config().engine_data_dir, PathBuf::from("/data"));
    assert_eq!(root.config().grpc_session_token, "token");
  }

  #[test]
  fn reads_grpc_session_token_from_cli_args() {
    let config = load_config_from(
      WorkspaceSidecarArgs {
        workspace_instance_id: Some("workspace-a".to_string()),
        workspace_root: Some(PathBuf::from("/workspace")),
        engine_data_dir: Some(PathBuf::from("/data")),
        grpc_session_token: Some("cli-token".to_string()),
      },
      Serialized::defaults(PartialWorkspaceCompositionConfig {
        workspace_instance_id: None,
        workspace_root: None,
        engine_data_dir: None,
        grpc_session_token: Some("env-token".to_string()),
      }),
    )
    .expect("config should include cli token");

    assert_eq!(config.grpc_session_token, "cli-token");
  }
}
