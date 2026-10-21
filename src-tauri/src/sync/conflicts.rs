#[path = "conflicts_verify.rs"]
mod verification;
use verification::{binding, root, verify};
#[path = "conflicts_files.rs"]
mod versions;
use super::{
  Binding, Channel, ConflictComparison, ConflictList, ConflictRequest, ResolutionRequest,
  ResolutionResult, SyncService,
  engine::{self, files, manifest::failure},
};
use crate::{
  error::{BackendError, BackendResult},
  workspace::{Workspace, WorkspaceRegistry},
};
use std::sync::Arc;
use tokio_util::sync::CancellationToken;
pub async fn list(
  service: &SyncService,
  workspace: &Workspace,
  root_path: &str,
) -> BackendResult<ConflictList> {
  root(workspace, root_path)?;
  let channel = service.channel(&workspace.root_info()).await?;
  let state = service.load_state(&workspace.root_info()).await?;
  workspace.ensure_active()?;
  Ok(ConflictList {
    conflicts: state.map(|v| v.unresolved_conflicts).unwrap_or_default(),
    binding: channel.map(|v| Binding {
      profile_id: v.profile_id,
      remote_root: v.remote_root,
    }),
  })
}
async fn compare(
  service: &SyncService,
  workspace: &Workspace,
  path: &str,
  cancel: &CancellationToken,
) -> BackendResult<ConflictComparison> {
  super::paths::sync_path(path)?;
  let conflict = service
    .load_state(&workspace.root_info())
    .await?
    .and_then(|v| v.unresolved_conflicts.into_iter().find(|v| v.path == path))
    .ok_or_else(|| failure("Sync conflict no longer exists; refresh the list"))?;
  let local = versions::version(&workspace.root_directory(), Some(&conflict.path), cancel).await?;
  let saved_remote = versions::version(
    &workspace.root_directory(),
    conflict.conflict_path.as_deref(),
    cancel,
  )
  .await?;
  if conflict.conflict_path.is_some() && saved_remote.hash != conflict.remote_hash {
    return Err(failure(
      "Saved remote version changed or is missing; sync again before resolving",
    ));
  }
  Ok(ConflictComparison {
    conflict,
    local,
    saved_remote,
  })
}
pub async fn read(
  service: &SyncService,
  workspace: &Arc<Workspace>,
  request: ConflictRequest,
  cancel: CancellationToken,
  owner: Option<(&WorkspaceRegistry, &str)>,
) -> BackendResult<ConflictComparison> {
  files::cancelled(&cancel)?;
  let _guard = files::interrupt(&cancel, async { Ok(workspace.mutation.lock().await) }).await?;
  engine::ensure_binding(workspace, owner)?;
  root(workspace, &request.root_path)?;
  binding(service, workspace, Some(&request.binding)).await?;
  let result = compare(service, workspace, &request.path, &cancel).await?;
  files::cancelled(&cancel)?;
  engine::ensure_binding(workspace, owner)?;
  Ok(result)
}
pub async fn resolve(
  service: &SyncService,
  workspace: &Arc<Workspace>,
  request: ResolutionRequest,
  cancel: CancellationToken,
  owner: Option<(&WorkspaceRegistry, &str)>,
) -> BackendResult<ResolutionResult> {
  files::cancelled(&cancel)?;
  root(workspace, &request.root_path)?;
  let channel = binding(service, workspace, Some(&request.binding)).await?;

  let remote = service.remote(&channel).await?;
  let _guard = files::interrupt(&cancel, async { Ok(workspace.mutation.lock().await) }).await?;
  engine::ensure_binding(workspace, owner)?;
  files::cancelled(&cancel)?;
  root(workspace, &request.root_path)?;
  // Cancellation never drops a filesystem future: its job must finish before
  // this guard is released, even when it has already entered spawn_blocking.
  workspace.flush_buffers_under_lock().await?;
  files::cancelled(&cancel)?;
  let comparison = compare(service, workspace, &request.path, &cancel).await?;
  if comparison.local.hash != request.expected_local_hash
    || comparison.saved_remote.hash != request.expected_remote_hash
  {
    return Err(failure("Conflict version changed; review it again"));
  }
  let removes = if request.choice == crate::sync::ConflictChoice::Local {
    comparison.local.hash.is_none()
  } else {
    comparison.saved_remote.hash.is_none()
  };
  if removes && !request.confirm_delete {
    return Err(failure("Confirm the deletion before resolving"));
  }
  let (manifest, etag) = engine::read_manifest(&remote, &cancel)
    .await?
    .ok_or_else(|| failure("Remote manifest is unavailable"))?;
  let remote_entry = manifest
    .entries
    .into_iter()
    .find(|v| v.path == request.path);
  let remote_hash = remote_entry
    .as_ref()
    .filter(|v| v.deleted_at.is_none())
    .map(|v| v.hash.as_str());
  if remote_hash != comparison.saved_remote.hash.as_deref()
    || remote_entry.as_ref().map(|v| &v.hash) != comparison.conflict.remote_hash.as_ref()
  {
    return Err(failure(
      "Remote version changed; sync again before resolving",
    ));
  }
  verify(
    service,
    workspace,
    &request,
    &comparison,
    &remote,
    &etag,
    &cancel,
  )
  .await?;
  let mut backup_path = None;
  if request.choice == crate::sync::ConflictChoice::Remote
    && comparison.local.hash != comparison.saved_remote.hash
  {
    if let Some(hash) = &comparison.local.hash {
      backup_path = Some(
        versions::backup(
          workspace,
          &request.path,
          hash,
          comparison.local.size,
          &cancel,
        )
        .await?,
      );
    }
    verify(
      service,
      workspace,
      &request,
      &comparison,
      &remote,
      &etag,
      &cancel,
    )
    .await?;
    if let Some(hash) = &comparison.saved_remote.hash {
      let source = files::resolve(
        &workspace.root_directory(),
        comparison
          .conflict
          .conflict_path
          .as_deref()
          .ok_or_else(|| failure("Saved conflict version is missing"))?,
      )
      .await?;
      files::publish(
        workspace,
        files::Publication {
          path: &request.path,
          source: &source,
          hash,
          size: comparison.saved_remote.size,
          expected: comparison.local.hash.as_deref(),
          overwrite: true,
        },
        &cancel,
      )
      .await?;
    } else {
      files::assert_hash(
        &workspace.root_directory(),
        &request.path,
        comparison.local.hash.as_deref(),
        &cancel,
      )
      .await?;
      let _commits = workspace.commit_gate.lock().await;
      files::assert_hash(
        &workspace.root_directory(),
        &request.path,
        comparison.local.hash.as_deref(),
        &cancel,
      )
      .await?;
      let target = files::resolve(&workspace.root_directory(), &request.path).await?;
      workspace
        .invalidate_external_paths(std::slice::from_ref(&request.path))
        .await?;
      files::cancelled(&cancel)?;
      match tokio::fs::remove_file(target).await {
        Ok(()) => (),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
        Err(e) => return Err(e.into()),
      }
    }
  }
  root(workspace, &request.root_path)?;
  let mut state = service
    .load_state(&workspace.root_info())
    .await?
    .ok_or_else(|| failure("Sync conflict state disappeared"))?;
  if !state.unresolved_conflicts.iter().any(|value| {
    value.path == comparison.conflict.path
      && value.remote_hash == comparison.conflict.remote_hash
      && value.conflict_path == comparison.conflict.conflict_path
  }) {
    return Err(failure("Conflict state changed; review it again"));
  }
  files::assert_hash(
    &workspace.root_directory(),
    &request.path,
    if request.choice == crate::sync::ConflictChoice::Remote {
      comparison.saved_remote.hash.as_deref()
    } else {
      comparison.local.hash.as_deref()
    },
    &cancel,
  )
  .await?;
  if let Some(path) = &comparison.conflict.conflict_path {
    files::assert_hash(
      &workspace.root_directory(),
      path,
      comparison.saved_remote.hash.as_deref(),
      &cancel,
    )
    .await?;
  }
  if engine::read_manifest(&remote, &cancel)
    .await?
    .as_ref()
    .map(|(_, value)| value)
    != Some(&etag)
  {
    return Err(failure(
      "Remote manifest changed; review after syncing again",
    ));
  }
  root(workspace, &request.root_path)?;
  binding(service, workspace, Some(&request.binding)).await?;
  files::cancelled(&cancel)?;
  state.baseline.retain(|v| v.path != request.path);
  if let Some(entry) = remote_entry {
    state.baseline.push(entry);
  }
  state.baseline.sort_by(|a, b| a.path.cmp(&b.path));
  state
    .unresolved_conflicts
    .retain(|v| v.path != request.path);
  state.remote_manifest_etag = Some(etag);
  state.updated_at = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
  service.save_state(&workspace.root_info(), &state).await?;
  Ok(ResolutionResult {
    ok: true,
    backup_path,
  })
}

#[cfg(test)]
#[path = "conflicts_tests.rs"]
mod tests;
