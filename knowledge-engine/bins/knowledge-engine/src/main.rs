mod composition;

fn main() {
  init_tracing();
  let composition = composition::WorkspaceCompositionRoot::from_env();
  tracing::debug!(
    workspace_root = composition.config().workspace_root.as_deref(),
    engine_data_dir = composition.config().engine_data_dir.as_deref(),
    "sidecar composition configured"
  );

  if let Err(error) = marklab_knowledge_rpc_server::run_stdio() {
    tracing::error!(%error, "knowledge engine failed");
    std::process::exit(1);
  }
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
