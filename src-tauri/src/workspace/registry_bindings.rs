use super::WorkspaceRegistry;
use crate::error::{BackendError, BackendResult};

impl WorkspaceRegistry {
  /// A window returning to a still-shared workspace gets a fresh binding epoch.
  pub fn binding_generation(&self, label: &str) -> BackendResult<u64> {
    self
      .binding_generations
      .read()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace binding generation lock failed"))?
      .get(label)
      .copied()
      .ok_or_else(|| BackendError::new("STALE_SESSION", "Window workspace binding is unavailable"))
  }

  pub(super) fn forget_binding(&self, label: &str) -> BackendResult<()> {
    self
      .binding_generations
      .write()
      .map_err(|_| BackendError::new("STATE_ERROR", "Workspace binding generation lock failed"))?
      .remove(label);
    Ok(())
  }
}
