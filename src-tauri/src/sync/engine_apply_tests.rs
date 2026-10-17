use super::*;
use crate::workspace::RootInfo;
use std::{collections::BTreeMap, path::PathBuf, sync::Mutex};
use tokio::sync::oneshot;

// Only this disposable root receives the test signal; other concurrent sync
// tests continue without interception.
static BEFORE_INVALIDATION: Mutex<Option<(PathBuf, oneshot::Sender<()>)>> = Mutex::new(None);
pub(super) fn before_invalidation(root: &Path) {
    let mut signal = BEFORE_INVALIDATION.lock().unwrap();
    if signal.as_ref().is_some_and(|(path, _)| path == root) {
        let (_, sender) = signal.take().unwrap();
        let _ = sender.send(());
    }
}

#[tokio::test]
async fn cancellation_while_buffer_invalidation_waits_does_not_delete_local_file() {
    let directory = tempfile::tempdir().unwrap();
    let root = tokio::fs::canonicalize(directory.path()).await.unwrap();
    let target = root.join("note.md");
    tokio::fs::write(&target, "retained text").await.unwrap();
    let workspace = Workspace::new(
        RootInfo {
            kind: "external".into(),
            path: root.to_string_lossy().into(),
        },
        1,
    );
    let (sender, cancel) = watch::channel(false);
    let fingerprint = files::inspect(&root, "note.md", &cancel)
        .await
        .unwrap()
        .unwrap();
    let local = ManifestEntry {
        path: "note.md".into(),
        hash: fingerprint.hash,
        size: fingerprint.size,
        modified_at: "2026-10-17T00:00:00.000Z".into(),
        device_id: "fixture".into(),
        storage: None,
        etag: None,
        deleted_at: None,
    };
    let operations = [Operation {
        path: "note.md".into(),
        kind: Kind::DeleteLocal,
        local: Some(local.clone()),
        baseline: Some(local),
        remote: None,
    }];
    let mut prepared = Prepared {
        remote: BTreeMap::new(),
        baseline: BTreeMap::new(),
        downloads: BTreeMap::new(),
        uploaded: 0,
        deleted: 0,
    };
    let mut result = SyncResult::default();
    let buffers = workspace.buffers.lock().await;
    let _mutation = workspace.mutation.lock().await;
    let (reached_tx, reached_rx) = oneshot::channel();
    *BEFORE_INVALIDATION.lock().unwrap() = Some((root, reached_tx));
    let applying = apply(&workspace, &operations, &mut prepared, &mut result, &cancel);
    tokio::pin!(applying);
    tokio::select! {
        value = &mut applying => panic!("Deletion finished before buffer gate released: {value:?}"),
        reached = reached_rx => reached.unwrap(),
    }
    sender.send(true).unwrap();
    assert!(futures_util::poll!(&mut applying).is_pending());
    drop(buffers);
    assert_eq!(applying.await.unwrap_err().code, "SYNC_CANCELLED");
    assert_eq!(
        tokio::fs::read_to_string(target).await.unwrap(),
        "retained text"
    );
}
