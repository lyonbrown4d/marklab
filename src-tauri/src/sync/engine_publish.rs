use super::*;
use crate::workspace::Workspace;
pub fn verify_download(file: &Path, hash: &str, size: u64) -> BackendResult<()> {
    let root = file
        .parent()
        .ok_or_else(|| failure("Invalid download path"))?;
    let name = file
        .file_name()
        .and_then(|v| v.to_str())
        .ok_or_else(|| failure("Invalid download path"))?;
    let value =
        fingerprint(root, name, None)?.ok_or_else(|| failure("Downloaded file disappeared"))?;
    if value.hash != hash || value.size != size {
        return Err(BackendError::new(
            "SYNC_INTEGRITY",
            "Downloaded file integrity verification failed",
        ));
    }
    Ok(())
}
pub struct Publication<'a> {
    pub path: &'a str,
    pub source: &'a Path,
    pub hash: &'a str,
    pub size: u64,
    pub expected: Option<&'a str>,
    pub overwrite: bool,
}
pub async fn publish(
    workspace: &Workspace,
    publication: Publication<'_>,
    cancel: &watch::Receiver<bool>,
) -> BackendResult<()> {
    let Publication {
        path,
        source,
        hash,
        size,
        expected,
        overwrite,
    } = publication;
    let root = workspace.root_directory();
    let destination = resolve(&root, path).await?;
    let parent = destination
        .parent()
        .ok_or_else(|| failure("Sync destination has no parent"))?;
    tokio::fs::create_dir_all(parent).await?;
    resolve(&root, path).await?;
    let temporary = temporary(Some(parent)).await?;
    tokio::fs::copy(source, temporary.path()).await?;
    let file = temporary.path().to_owned();
    let hash = hash.to_owned();
    tauri::async_runtime::spawn_blocking(move || verify_download(&file, &hash, size))
        .await
        .map_err(|e| failure(&e.to_string()))??;
    let _commits = workspace.commit_gate.lock().await;
    assert_hash(&root, path, expected, cancel).await?;
    workspace.ensure_active()?;
    cancelled(cancel)?;
    workspace.invalidate_external_paths(&[path.into()]).await?;
    resolve(&root, path).await?;
    let destination = destination.to_owned();
    let path = path.to_owned();
    let cancel = cancel.clone();
    tauri::async_runtime::spawn_blocking(move || {
        target_check(&root, path.as_str())?;
        cancelled(&cancel)?;
        if overwrite {
            temporary
                .persist(&destination)
                .map_err(|e| BackendError::from(e.error))?;
        } else {
            temporary
                .persist_noclobber(&destination)
                .map_err(|e| BackendError::from(e.error))?;
        }
        Ok(())
    })
    .await
    .map_err(|e| failure(&e.to_string()))?
}
