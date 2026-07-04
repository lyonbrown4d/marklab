mod context_tools;
mod protocol;

use std::error::Error;
use std::io;
use std::path::PathBuf;

use clap::Parser;
use context_tools::{McpContextConfig, McpContextTools};
use figment2::{
  providers::{Env, Serialized},
  Figment, Provider as FigmentProvider,
};

const DEFAULT_SEARCH_LIMIT: usize = 10;

type McpSidecarResult<T> = Result<T, Box<dyn Error + Send + Sync>>;

#[derive(Debug, Parser)]
#[command(name = "marklab-mcp")]
#[command(about = "Read-only MCP sidecar for MarkLab workspace context")]
struct Args {
  #[arg(long)]
  workspace_root: Option<PathBuf>,
  #[arg(long)]
  engine_data_dir: Option<PathBuf>,
  #[arg(long)]
  default_search_limit: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize, serde::Serialize)]
struct McpRuntimeConfig {
  workspace_root: PathBuf,
  engine_data_dir: PathBuf,
  default_search_limit: usize,
}

#[derive(Debug, serde::Serialize)]
struct PartialMcpRuntimeConfig {
  #[serde(skip_serializing_if = "Option::is_none")]
  workspace_root: Option<PathBuf>,
  #[serde(skip_serializing_if = "Option::is_none")]
  engine_data_dir: Option<PathBuf>,
  #[serde(skip_serializing_if = "Option::is_none")]
  default_search_limit: Option<usize>,
}

impl PartialMcpRuntimeConfig {
  fn defaults() -> Self {
    Self {
      workspace_root: None,
      engine_data_dir: None,
      default_search_limit: Some(DEFAULT_SEARCH_LIMIT),
    }
  }
}

impl From<Args> for PartialMcpRuntimeConfig {
  fn from(args: Args) -> Self {
    Self {
      workspace_root: args.workspace_root,
      engine_data_dir: args.engine_data_dir,
      default_search_limit: args.default_search_limit,
    }
  }
}

fn main() {
  init_tracing();

  if let Err(error) = run() {
    tracing::error!(%error, "marklab mcp sidecar failed");
    std::process::exit(1);
  }
}

fn run() -> McpSidecarResult<()> {
  let args = load_config()?;
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

fn load_config() -> io::Result<McpRuntimeConfig> {
  load_config_from(Args::parse(), filtered_env())
}

fn load_config_from<T: FigmentProvider>(args: Args, source: T) -> io::Result<McpRuntimeConfig> {
  Figment::from(Serialized::defaults(PartialMcpRuntimeConfig::defaults()))
    .merge(source)
    .merge(Serialized::defaults(PartialMcpRuntimeConfig::from(args)))
    .extract::<McpRuntimeConfig>()
    .map_err(|error| io::Error::new(io::ErrorKind::InvalidInput, error.to_string()))
}

fn filtered_env() -> Env {
  Env::prefixed("MARKLAB_MCP_").ignore_empty(true).only(&[
    "workspace_root",
    "engine_data_dir",
    "default_search_limit",
  ])
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn merges_mcp_config_from_env_and_cli() {
    let config = load_config_from(
      Args {
        workspace_root: Some(PathBuf::from("/cli-workspace")),
        engine_data_dir: None,
        default_search_limit: None,
      },
      Serialized::defaults(PartialMcpRuntimeConfig {
        workspace_root: Some(PathBuf::from("/env-workspace")),
        engine_data_dir: Some(PathBuf::from("/env-data")),
        default_search_limit: Some(25),
      }),
    )
    .expect("config should be valid");

    assert_eq!(config.workspace_root, PathBuf::from("/cli-workspace"));
    assert_eq!(config.engine_data_dir, PathBuf::from("/env-data"));
    assert_eq!(config.default_search_limit, 25);
  }

  #[test]
  fn keeps_default_search_limit_when_not_configured() {
    let config = load_config_from(
      Args {
        workspace_root: Some(PathBuf::from("/workspace")),
        engine_data_dir: Some(PathBuf::from("/data")),
        default_search_limit: None,
      },
      Serialized::defaults(PartialMcpRuntimeConfig {
        workspace_root: None,
        engine_data_dir: None,
        default_search_limit: None,
      }),
    )
    .expect("config should be valid");

    assert_eq!(config.default_search_limit, DEFAULT_SEARCH_LIMIT);
  }

  #[test]
  fn reports_missing_required_paths_after_merge() {
    let error = load_config_from(
      Args {
        workspace_root: None,
        engine_data_dir: Some(PathBuf::from("/data")),
        default_search_limit: None,
      },
      Serialized::defaults(PartialMcpRuntimeConfig {
        workspace_root: None,
        engine_data_dir: None,
        default_search_limit: None,
      }),
    )
    .expect_err("workspace root should be required");

    assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
  }
}
