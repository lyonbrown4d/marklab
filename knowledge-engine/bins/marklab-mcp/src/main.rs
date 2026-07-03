mod context_tools;
mod protocol;

use std::error::Error;
use std::io;
use std::path::PathBuf;

use clap::Parser;
use context_tools::{McpContextConfig, McpContextTools};

const DEFAULT_SEARCH_LIMIT: usize = 10;

type McpSidecarResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Debug, Parser)]
#[command(name = "marklab-mcp")]
#[command(about = "Read-only MCP sidecar for MarkLab workspace context")]
struct Args {
  #[arg(long)]
  workspace_root: PathBuf,
  #[arg(long)]
  engine_data_dir: PathBuf,
  #[arg(long, default_value_t = DEFAULT_SEARCH_LIMIT)]
  default_search_limit: usize,
}

fn main() {
  init_tracing();

  if let Err(error) = run() {
    tracing::error!(%error, "marklab mcp sidecar failed");
    std::process::exit(1);
  }
}

fn run() -> McpSidecarResult<()> {
  let args = Args::parse();
  let config = McpContextConfig::new(
    args.workspace_root,
    args.engine_data_dir,
    args.default_search_limit,
  );
  let tools = McpContextTools::open(config)?;
  let stdin = io::stdin();
  let stdout = io::stdout();

  protocol::serve(tools, stdin.lock(), stdout.lock())?;
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
