use super::super::{
  ManifestEntry,
  remote::{Condition, DavRemote},
};
use super::{
  files,
  manifest::{self, Kind, MAX_FILE, Operation, failure},
};
use crate::{error::BackendResult, workspace::Workspace};
use std::{collections::BTreeMap, path::Path};
use tokio_util::sync::CancellationToken;
pub struct Prepared {
  pub remote: BTreeMap<String, ManifestEntry>,
  pub baseline: BTreeMap<String, ManifestEntry>,
  pub downloads: BTreeMap<String, tempfile::NamedTempFile>,
  pub uploaded: u32,
  pub deleted: u32,
}
pub struct Preparation<'a> {
  pub operations: &'a [Operation],
  pub entries: &'a [ManifestEntry],
  pub baseline: &'a [ManifestEntry],
  pub device: &'a str,
  pub now: &'a str,
}
pub async fn prepare(
  remote: &DavRemote,
  root: &Path,
  preparation: Preparation<'_>,
  cancel: &CancellationToken,
) -> BackendResult<Prepared> {
  let Preparation {
    operations,
    entries,
    baseline,
    device,
    now,
  } = preparation;
  let mut prepared = Prepared {
    remote: entries
      .iter()
      .map(|v| (v.path.clone(), v.clone()))
      .collect(),
    baseline: baseline
      .iter()
      .map(|v| (v.path.clone(), v.clone()))
      .collect(),
    downloads: BTreeMap::new(),
    uploaded: 0,
    deleted: 0,
  };
  for operation in operations {
    files::cancelled(cancel)?;
    match operation.kind {
      Kind::Upload => {
        let entry = operation
          .local
          .as_ref()
          .ok_or_else(|| failure("Upload lacks a local version"))?;
        let snapshot = files::snapshot(root, &entry.path, &entry.hash, entry.size, cancel).await?;
        ensure_object(remote, entry, snapshot.path(), cancel).await?;
        let mut entry = entry.clone();
        entry.storage = Some("object".into());
        entry.device_id = device.into();
        prepared.remote.insert(entry.path.clone(), entry.clone());
        prepared.baseline.insert(entry.path.clone(), entry);
        prepared.uploaded += 1;
      }
      Kind::DeleteRemote => {
        let hash = operation
          .baseline
          .as_ref()
          .or(operation.remote.as_ref())
          .map(|v| v.hash.clone())
          .unwrap_or_else(|| "0".repeat(64));
        let entry = ManifestEntry {
          path: operation.path.clone(),
          hash,
          size: 0,
          modified_at: now.into(),
          device_id: device.into(),
          storage: None,
          etag: None,
          deleted_at: Some(now.into()),
        };
        prepared
          .remote
          .insert(operation.path.clone(), entry.clone());
        prepared.baseline.insert(operation.path.clone(), entry);
        prepared.deleted += 1;
      }
      Kind::Noop => {
        if let Some(entry) = operation.remote.as_ref().or(operation.local.as_ref()) {
          prepared
            .baseline
            .insert(operation.path.clone(), entry.clone());
        } else {
          prepared.baseline.remove(&operation.path);
        }
      }
      Kind::Download | Kind::Conflict => {
        if let Some(entry) = operation.remote.as_ref().filter(|v| v.deleted_at.is_none()) {
          let temporary = files::temporary(None).await?;
          let content_path = manifest::content_path(entry);
          files::retry(cancel, || {
            remote.download(&content_path, temporary.path(), MAX_FILE)
          })
          .await?;
          let path = temporary.path().to_path_buf();
          let hash = entry.hash.clone();
          let size = entry.size;
          tauri::async_runtime::spawn_blocking(move || files::verify_download(&path, &hash, size))
            .await
            .map_err(|e| failure(&e.to_string()))??;
          prepared.downloads.insert(operation.path.clone(), temporary);
        }
      }
      _ => (),
    }
  }
  Ok(prepared)
}
async fn verify_object(
  remote: &DavRemote,
  entry: &ManifestEntry,
  cancel: &CancellationToken,
) -> BackendResult<()> {
  let temporary = files::temporary(None).await?;
  let path = manifest::content_path(&ManifestEntry {
    storage: Some("object".into()),
    ..entry.clone()
  });
  files::retry(cancel, || {
    remote.download(&path, temporary.path(), entry.size)
  })
  .await?;
  let file = temporary.path().to_owned();
  let hash = entry.hash.clone();
  let size = entry.size;
  tauri::async_runtime::spawn_blocking(move || files::verify_download(&file, &hash, size))
    .await
    .map_err(|e| failure(&e.to_string()))?
}
async fn ensure_object(
  remote: &DavRemote,
  entry: &ManifestEntry,
  snapshot: &Path,
  cancel: &CancellationToken,
) -> BackendResult<()> {
  match verify_object(remote, entry, cancel).await {
    Ok(()) => return Ok(()),
    Err(error) if error.code == "WEBDAV_NOT_FOUND" => (),
    Err(error) => return Err(error),
  }
  let path = format!(".marklab-sync/objects/{}", entry.hash);
  match files::retry(cancel, || {
    remote.put_file(
      &path,
      snapshot,
      entry.size,
      Condition {
        if_match: None,
        if_none_match: true,
      },
    )
  })
  .await
  {
    Ok(_) => Ok(()),
    Err(error) if error.code == "WEBDAV_PRECONDITION_FAILED" => {
      verify_object(remote, entry, cancel).await
    }
    Err(error) => Err(error),
  }
}
pub async fn assert_local(
  workspace: &Workspace,
  operations: &[Operation],
  cancel: &CancellationToken,
) -> BackendResult<()> {
  workspace.ensure_active()?;
  for operation in operations.iter().filter(|v| {
    matches!(
      v.kind,
      Kind::Upload | Kind::Download | Kind::DeleteLocal | Kind::DeleteRemote | Kind::Conflict
    )
  }) {
    files::assert_hash(
      &workspace.root_directory(),
      &operation.path,
      operation.local.as_ref().map(|v| v.hash.as_str()),
      cancel,
    )
    .await?;
  }
  Ok(())
}
pub use super::apply::apply;
