pub(crate) use fluxdi as di;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct WorkspaceCompositionConfig {
  pub(crate) workspace_instance_id: Option<String>,
  pub(crate) workspace_root: Option<String>,
  pub(crate) engine_data_dir: Option<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct WorkspaceCompositionRoot {
  config: WorkspaceCompositionConfig,
}

impl WorkspaceCompositionRoot {
  pub(crate) fn from_env() -> Self {
    let config = WorkspaceCompositionConfig {
      workspace_instance_id: std::env::var("WORKSPACE_INSTANCE_ID").ok(),
      workspace_root: std::env::var("WORKSPACE_ROOT").ok(),
      engine_data_dir: std::env::var("ENGINE_DATA_DIR").ok(),
    };

    tracing::debug!(
      workspace_instance_id = config.workspace_instance_id.as_deref().unwrap_or("stdio"),
      "created sidecar composition root"
    );

    let _di_boundary = std::any::type_name::<di::Injector>();

    Self { config }
  }

  pub(crate) fn config(&self) -> &WorkspaceCompositionConfig {
    &self.config
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn keeps_workspace_configuration_inside_binary_boundary() {
    let root = WorkspaceCompositionRoot {
      config: WorkspaceCompositionConfig {
        workspace_instance_id: Some("workspace-a".to_string()),
        workspace_root: Some("/workspace".to_string()),
        engine_data_dir: Some("/data".to_string()),
      },
    };

    assert_eq!(
      root.config().workspace_instance_id.as_deref(),
      Some("workspace-a")
    );
  }
}
