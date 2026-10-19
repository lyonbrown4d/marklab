use super::*;
use std::path::Path;
pub(super) struct Repository(tempfile::TempDir);
impl Repository {
  pub(super) async fn new() -> Self {
    let directory = tempfile::tempdir().unwrap();
    process::init(directory.path()).await.unwrap();
    process::repository(directory.path(), |repo| {
      let mut config = repo.config()?;
      config.set_str("user.name", "Fixture")?;
      config.set_str("user.email", "fixture@example.invalid")?;
      Ok(())
    })
    .await
    .unwrap();
    Self(directory)
  }
  pub(super) fn root(&self) -> &Path {
    self.0.path()
  }
  pub(super) async fn branch(&self, operation: &str, name: &str) {
    local::branch_action(
      self.root(),
      operation,
      &types::BranchRequest {
        expected_root: None,
        name: name.into(),
        start_point: None,
        force: None,
      },
    )
    .await
    .unwrap();
  }
  pub(super) async fn commit(&self, text: &str) {
    std::fs::write(self.root().join("file.txt"), text).unwrap();
    local::commit(self.root(), "fixture", true).await.unwrap();
  }
}
