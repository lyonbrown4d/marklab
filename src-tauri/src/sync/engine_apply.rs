use super::super::{ManifestEntry, SyncConflict, SyncResult};
use super::{
  files,
  manifest::{Kind, Operation, failure},
  transfer::Prepared,
};
use crate::{error::BackendResult, workspace::Workspace};
use std::path::Path;
use tokio::sync::watch;
pub async fn apply(
  workspace: &Workspace,
  operations: &[Operation],
  prepared: &mut Prepared,
  result: &mut SyncResult,
  cancel: &watch::Receiver<bool>,
) -> BackendResult<()> {
  let root = workspace.root_directory();
  for operation in operations {
    workspace.ensure_active()?;
    files::cancelled(cancel)?;
    match operation.kind {
      Kind::Download => {
        let entry = operation
          .remote
          .as_ref()
          .ok_or_else(|| failure("Download lacks a remote version"))?;
        let temporary = prepared
          .downloads
          .get(&operation.path)
          .ok_or_else(|| failure("Downloaded version disappeared"))?;
        files::publish(
          workspace,
          files::Publication {
            path: &operation.path,
            source: temporary.path(),
            hash: &entry.hash,
            size: entry.size,
            expected: operation.local.as_ref().map(|v| v.hash.as_str()),
            overwrite: true,
          },
          cancel,
        )
        .await?;
        prepared
          .baseline
          .insert(operation.path.clone(), entry.clone());
        result.changed_paths.push(operation.path.clone());
        result.downloaded += 1;
      }
      Kind::DeleteLocal => {
        let _commits = workspace.commit_gate.lock().await;
        files::assert_hash(
          &root,
          &operation.path,
          operation.local.as_ref().map(|v| v.hash.as_str()),
          cancel,
        )
        .await?;
        let target = files::resolve(&root, &operation.path).await?;
        #[cfg(test)]
        tests::before_invalidation(&root);
        workspace
          .invalidate_external_paths(std::slice::from_ref(&operation.path))
          .await?;
        files::cancelled(cancel)?;
        match tokio::fs::remove_file(target).await {
          Ok(()) => (),
          Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
          Err(e) => return Err(e.into()),
        }
        if let Some(entry) = &operation.remote {
          prepared
            .baseline
            .insert(operation.path.clone(), entry.clone());
        } else {
          prepared.baseline.remove(&operation.path);
        }
        result.changed_paths.push(operation.path.clone());
        result.deleted += 1;
      }
      Kind::Conflict => {
        let mut conflict = SyncConflict {
          path: operation.path.clone(),
          status: "unresolved".into(),
          reason: if operation.local.is_none()
            || operation
              .remote
              .as_ref()
              .is_none_or(|v| v.deleted_at.is_some())
          {
            "delete_vs_change"
          } else {
            "both_changed"
          }
          .into(),
          conflict_path: None,
          local_hash: operation.local.as_ref().map(|v| v.hash.clone()),
          remote_hash: operation.remote.as_ref().map(|v| v.hash.clone()),
        };
        if let Some(entry) = operation.remote.as_ref().filter(|v| v.deleted_at.is_none()) {
          let (path, existing) = conflict_path(&root, entry, cancel).await?;
          if !existing {
            let source = prepared
              .downloads
              .get(&operation.path)
              .ok_or_else(|| failure("Conflict remote version disappeared"))?;
            files::publish(
              workspace,
              files::Publication {
                path: &path,
                source: source.path(),
                hash: &entry.hash,
                size: entry.size,
                expected: None,
                overwrite: false,
              },
              cancel,
            )
            .await?;
            result.changed_paths.push(path.clone());
          }
          conflict.conflict_path = Some(path);
        }
        result.conflicts.push(conflict);
      }
      _ => (),
    }
  }
  Ok(())
}
pub async fn conflict_path(
  root: &Path,
  entry: &ManifestEntry,
  cancel: &watch::Receiver<bool>,
) -> BackendResult<(String, bool)> {
  let source = Path::new(&entry.path);
  let stem = source
    .file_stem()
    .and_then(|v| v.to_str())
    .ok_or_else(|| failure("Invalid conflict filename"))?;
  let extension = source
    .extension()
    .and_then(|v| v.to_str())
    .map(|v| format!(".{v}"))
    .unwrap_or_default();
  let device = entry
    .device_id
    .chars()
    .map(|v| {
      if v.is_ascii_alphanumeric() || v == '_' || v == '-' {
        v
      } else {
        '-'
      }
    })
    .collect::<String>();
  let device = device
    .trim_matches('-')
    .chars()
    .take(48)
    .collect::<String>();
  let device = if device.is_empty() { "remote" } else { &device };
  let timestamp = entry
    .modified_at
    .chars()
    .filter(char::is_ascii_digit)
    .take(14)
    .collect::<String>();
  let parent = source
    .parent()
    .filter(|v| !v.as_os_str().is_empty())
    .map(|v| format!("{}/", v.to_string_lossy()))
    .unwrap_or_default();
  for attempt in 1..=10000 {
    let suffix = if attempt == 1 {
      String::new()
    } else {
      format!("-{attempt}")
    };
    let path = format!(
      "{parent}{stem}.conflict-{device}-{timestamp}-{}{suffix}{extension}",
      &entry.hash[..8]
    );
    match files::inspect(root, &path, cancel).await? {
      None => return Ok((path, false)),
      Some(file) if file.hash == entry.hash && file.size == entry.size => {
        return Ok((path, true));
      }
      _ => (),
    }
  }
  Err(failure("Unable to allocate a unique conflict filename"))
}

#[cfg(test)]
#[path = "engine_apply_tests.rs"]
mod tests;
