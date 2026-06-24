mod composition;
mod grpc_query_services;
mod grpc_services;
mod grpc_workspace;

use std::error::Error;

use composition::WorkspaceCompositionRoot;

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
  let composition = WorkspaceCompositionRoot::from_cli()?;
  composition.bootstrap().await?;
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
