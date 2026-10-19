#[path = "engine_apply.rs"]
mod apply;
#[path = "engine_files.rs"]
pub(crate) mod files;
#[path = "engine_manifest.rs"]
pub(crate) mod manifest;
#[path = "engine_scan.rs"]
mod scan;
#[path = "engine_transfer.rs"]
pub(crate) mod transfer;
use super::{
  Manifest, SyncProgress, SyncResult, SyncService, SyncState,
  remote::{Condition, DavRemote},
};
use crate::{
  error::{BackendError, BackendResult},
  workspace::{Workspace, WorkspaceRegistry},
};
use std::{
  collections::{BTreeMap, BTreeSet},
  sync::Arc,
};
use tokio::sync::watch;
pub async fn synchronize(
  service: &SyncService,
  workspace: &Arc<Workspace>,
  progress: &(dyn Fn(SyncProgress) + Send + Sync),
  mut cancel: watch::Receiver<bool>,
  owner: Option<(&WorkspaceRegistry, &str)>,
) -> BackendResult<SyncResult> {
  files::cancelled(&cancel)?;
  let root = workspace.root_info();
  let device = service.device_id().await?;
  let channel = service
    .channel(&root)
    .await?
    .ok_or_else(|| manifest::failure("Configure a WebDAV sync channel first"))?;
  let remote = service.remote(&channel).await?;
  report(progress, "flushing", 0, 0, None);
  {
    let _guard =
      files::interrupt(&mut cancel, async { Ok(workspace.mutation.lock().await) }).await?;
    ensure_binding(workspace, owner)?;
    workspace.flush_buffers_under_lock().await?;
  }
  let state = service.load_state(&root).await?;
  if let Some(state) = &state {
    manifest::validate(&Manifest {
      version: state.version,
      device_id: device.clone(),
      updated_at: state.updated_at.clone(),
      entries: state.baseline.clone(),
    })?;
  }
  let baseline = state
    .as_ref()
    .map(|v| v.baseline.clone())
    .unwrap_or_default();
  for replan in 0..=2 {
    workspace.ensure_active()?;
    files::cancelled(&cancel)?;
    report(progress, "scanning", 0, 0, None);
    let local = scan::local(&workspace.root_directory(), &device, &cancel).await?;
    report(progress, "reading_remote", 0, 0, None);
    let snapshot = read_manifest(&remote, &mut cancel).await?;
    if snapshot.is_none() && state.is_some() {
      return Err(BackendError::new(
        "WEBDAV_PRECONDITION_FAILED",
        "Remote sync manifest is missing for an initialized workspace",
      ));
    }
    let remote_entries = if let Some((manifest, _)) = &snapshot {
      manifest.entries.clone()
    } else {
      match files::retry(&mut cancel, || remote.stat(".marklab-sync")).await {
        Ok(_) => {
          return Err(manifest::failure(
            "Remote sync metadata exists but its manifest is missing",
          ));
        }
        Err(error) if error.code == "WEBDAV_NOT_FOUND" => (),
        Err(error) => return Err(error),
      }
      scan::bootstrap(&remote, &mut cancel).await?.entries
    };
    manifest::compatible(
      local
        .entries
        .iter()
        .map(|v| v.path.as_str())
        .chain(local.skipped.iter().map(|v| v.path.as_str()))
        .chain(baseline.iter().map(|v| v.path.as_str()))
        .chain(remote_entries.iter().map(|v| v.path.as_str())),
    )?;
    let mut protected: BTreeSet<String> = local.skipped.iter().map(|v| v.path.clone()).collect();
    let mut skipped = local.skipped;
    for entry in &remote_entries {
      if entry.deleted_at.is_none() && entry.size > manifest::MAX_FILE {
        protected.insert(entry.path.clone());
        if !skipped.iter().any(|v| v.path == entry.path) {
          skipped.push(super::SkippedFile {
            path: entry.path.clone(),
            reason: "file_too_large".into(),
            size: entry.size,
          });
        }
      }
    }
    report(progress, "planning", 0, 0, None);
    let operations = manifest::plan(&local.entries, &baseline, &remote_entries, &protected);
    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut prepared = transfer::prepare(
      &remote,
      &workspace.root_directory(),
      transfer::Preparation {
        operations: &operations,
        entries: &remote_entries,
        baseline: &baseline,
        device: &device,
        now: &now,
      },
      &mut cancel,
    )
    .await?;
    let next_manifest = Manifest {
      version: 1,
      device_id: device.clone(),
      updated_at: now.clone(),
      entries: prepared.remote.values().cloned().collect(),
    };
    let bytes = manifest::serialize(&next_manifest)?;
    let _guard =
      files::interrupt(&mut cancel, async { Ok(workspace.mutation.lock().await) }).await?;
    ensure_binding(workspace, owner)?;
    workspace.flush_buffers_under_lock().await?;
    transfer::assert_local(workspace, &operations, &cancel).await?;
    workspace.ensure_active()?;
    report(progress, "writing_manifest", 0, 0, None);
    let condition = Condition {
      if_match: snapshot.as_ref().map(|(_, etag)| etag.clone()),
      if_none_match: snapshot.is_none(),
    };
    let written = files::retry(&mut cancel, || {
      remote.put_bytes(manifest::MANIFEST_PATH, bytes.clone(), condition.clone())
    })
    .await;
    let etag = match written {
      Ok(value) => value,
      Err(error) if error.code == "WEBDAV_PRECONDITION_FAILED" && replan < 2 => {
        drop(_guard);
        continue;
      }
      Err(error) => return Err(error),
    };
    let mut result = SyncResult {
      uploaded: prepared.uploaded,
      deleted: prepared.deleted,
      retries: replan,
      skipped,
      ..SyncResult::default()
    };
    report(progress, "applying", 0, operations.len(), None);
    transfer::apply(workspace, &operations, &mut prepared, &mut result, &cancel).await?;
    let mut conflicts: BTreeMap<_, _> = result
      .conflicts
      .into_iter()
      .map(|v| (v.path.clone(), v))
      .collect();
    if let Some(previous) = &state {
      for conflict in &previous.unresolved_conflicts {
        if operations
          .iter()
          .any(|v| v.path == conflict.path && v.kind == manifest::Kind::Skip)
        {
          conflicts
            .entry(conflict.path.clone())
            .or_insert_with(|| conflict.clone());
        }
      }
    }
    result.conflicts = conflicts.into_values().collect();
    result.changed_paths.sort();
    result.changed_paths.dedup();
    workspace.ensure_active()?;
    files::cancelled(&cancel)?;
    service
      .save_state(
        &root,
        &SyncState {
          version: 1,
          remote_manifest_etag: etag,
          baseline: prepared.baseline.into_values().collect(),
          unresolved_conflicts: result.conflicts.clone(),
          updated_at: now,
        },
      )
      .await?;
    report(progress, "completed", 1, 1, None);
    return Ok(result);
  }
  Err(BackendError::new(
    "WEBDAV_PRECONDITION_FAILED",
    "Remote manifest kept changing",
  ))
}
pub(crate) async fn read_manifest(
  remote: &DavRemote,
  cancel: &mut watch::Receiver<bool>,
) -> BackendResult<Option<(Manifest, String)>> {
  match files::retry(cancel, || {
    remote.get(manifest::MANIFEST_PATH, manifest::MAX_MANIFEST)
  })
  .await
  {
    Ok(value) => {
      let etag = manifest::strong(value.etag.as_deref())?.to_owned();
      Ok(Some((manifest::parse(&value.body)?, etag)))
    }
    Err(error) if error.code == "WEBDAV_NOT_FOUND" => Ok(None),
    Err(error) => Err(error),
  }
}
fn report(
  handler: &(dyn Fn(SyncProgress) + Send + Sync),
  stage: &'static str,
  completed: usize,
  total: usize,
  path: Option<String>,
) {
  handler(SyncProgress {
    stage,
    completed,
    total,
    path,
  });
}
#[cfg(test)]
#[path = "engine_tests.rs"]
mod tests;

pub(crate) fn ensure_binding(
  workspace: &Arc<Workspace>,
  owner: Option<(&WorkspaceRegistry, &str)>,
) -> BackendResult<()> {
  if let Some((registry, label)) = owner {
    registry.ensure_binding(label, workspace)
  } else {
    workspace.ensure_active()
  }
}
