use super::*;
pub(super) async fn verify(
  service: &SyncService,
  workspace: &Workspace,
  request: &ResolutionRequest,
  comparison: &ConflictComparison,
  remote: &super::super::remote::DavRemote,
  etag: &str,
  cancel: &CancellationToken,
) -> BackendResult<()> {
  let conflict = &comparison.conflict;
  let local = comparison.local.hash.as_deref();
  let saved = comparison.saved_remote.hash.as_deref();
  root(workspace, &request.root_path)?;
  binding(service, workspace, Some(&request.binding)).await?;
  files::assert_hash(&workspace.root_directory(), &conflict.path, local, cancel).await?;
  if let Some(path) = &conflict.conflict_path {
    files::assert_hash(&workspace.root_directory(), path, saved, cancel).await?;
  }
  if engine::read_manifest(remote, cancel)
    .await?
    .as_ref()
    .map(|(_, value)| value.as_str())
    != Some(etag)
  {
    return Err(failure(
      "Remote manifest changed; review after syncing again",
    ));
  }
  workspace.ensure_active()?;
  Ok(())
}

pub(super) fn root(workspace: &Workspace, expected: &str) -> BackendResult<()> {
  workspace.ensure_active()?;
  let root = workspace.root_info();
  if root.kind == crate::workspace::RootKind::Single || root.path != expected {
    return Err(BackendError::new(
      "STALE_SESSION",
      "Workspace changed before resolving sync conflicts",
    ));
  }
  Ok(())
}
pub(super) async fn binding(
  service: &SyncService,
  workspace: &Workspace,
  expected: Option<&Binding>,
) -> BackendResult<Channel> {
  let channel = service
    .channel(&workspace.root_info())
    .await?
    .ok_or_else(|| failure("Sync channel is no longer configured"))?;
  if expected.is_some_and(|value| {
    value.profile_id != channel.profile_id || value.remote_root != channel.remote_root
  }) {
    return Err(failure("Sync channel changed; refresh the conflict list"));
  }
  Ok(channel)
}
