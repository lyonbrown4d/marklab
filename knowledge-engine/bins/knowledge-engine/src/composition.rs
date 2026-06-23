use std::env;
use std::io::{self, ErrorKind};
use std::path::PathBuf;

#[derive(Debug, Clone, PartialEq, Eq)]
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
  pub(crate) fn from_env() -> io::Result<Self> {
    let config = WorkspaceCompositionConfig {
      workspace_instance_id: required_env("WORKSPACE_INSTANCE_ID")?,
      workspace_root: PathBuf::from(required_env("WORKSPACE_ROOT")?),
      engine_data_dir: PathBuf::from(required_env("ENGINE_DATA_DIR")?),
      grpc_session_token: required_env("GRPC_SESSION_TOKEN")?,
    };

    tracing::debug!(
      workspace_instance_id = %config.workspace_instance_id,
      "created grpc sidecar composition root"
    );

    Ok(Self { config })
  }

  pub(crate) fn config(&self) -> &WorkspaceCompositionConfig {
    &self.config
  }
}

fn required_env(name: &str) -> io::Result<String> {
  match env::var(name) {
    Ok(value) if !value.trim().is_empty() => Ok(value),
    Ok(_) => Err(io::Error::new(
      ErrorKind::InvalidInput,
      format!("{name} must not be empty"),
    )),
    Err(error) => Err(io::Error::new(
      ErrorKind::InvalidInput,
      format!("{name} is required: {error}"),
    )),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keeps_workspace_configuration_inside_binary_boundary() {
    let root = WorkspaceCompositionRoot {
      config: WorkspaceCompositionConfig {
        workspace_instance_id: "workspace-a".to_string(),
        workspace_root: PathBuf::from("/workspace"),
        engine_data_dir: PathBuf::from("/data"),
        grpc_session_token: "token".to_string(),
      },
    };

    assert_eq!(root.config().workspace_instance_id, "workspace-a");
  }
}
