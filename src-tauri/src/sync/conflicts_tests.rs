use super::*;
use crate::{database::Database, workspace::RootInfo};
use std::sync::Arc;
async fn fixture() -> (tempfile::TempDir, SyncService, Arc<Workspace>) {
    let directory = tempfile::tempdir().unwrap();
    let database = Database::open(directory.path()).await.unwrap();
    let service = SyncService::new(database.pool.clone()).await.unwrap();
    service.update_profile(serde_json::from_value(serde_json::json!({"id":"test","label":"Test","endpoint":"http://127.0.0.1:9","username":"fixture","allowInsecureLocal":true,"sessionOnly":true})).unwrap()).await.unwrap();
    let root = directory.path().join("workspace");
    tokio::fs::create_dir(&root).await.unwrap();
    let root = tokio::fs::canonicalize(root).await.unwrap();
    tokio::fs::write(root.join("note.md"), "before")
        .await
        .unwrap();
    let workspace = Arc::new(Workspace::new(
        RootInfo {
            kind: "external".into(),
            path: root.to_string_lossy().into(),
        },
        1,
    ));
    service
        .set_channel(
            &workspace.root_info(),
            Channel {
                provider: "webdav".into(),
                profile_id: "test".into(),
                remote_root: "/notes".into(),
                auto_sync: false,
            },
        )
        .await
        .unwrap();
    (directory, service, workspace)
}
fn binding() -> Binding {
    Binding {
        profile_id: "test".into(),
        remote_root: "/notes".into(),
    }
}
fn resolution(workspace: &Workspace) -> ResolutionRequest {
    ResolutionRequest {
        root_path: workspace.root_info().path,
        path: "note.md".into(),
        binding: binding(),
        choice: "remote".into(),
        expected_local_hash: None,
        expected_remote_hash: None,
        confirm_delete: false,
    }
}
#[tokio::test]
async fn cancelled_conflict_requests_stop_before_read_or_mutation() {
    let (_directory, service, workspace) = fixture().await;
    let (_sender, cancel) = watch::channel(true);
    let read = read(
        &service,
        &workspace,
        ConflictRequest {
            root_path: workspace.root_info().path,
            path: "note.md".into(),
            binding: binding(),
        },
        cancel.clone(),
        None,
    )
    .await;
    assert_eq!(read.err().unwrap().code, "SYNC_CANCELLED");
    let resolved = resolve(&service, &workspace, resolution(&workspace), cancel, None).await;
    assert_eq!(resolved.err().unwrap().code, "SYNC_CANCELLED");
    assert_eq!(
        tokio::fs::read_to_string(workspace.root_directory().join("note.md"))
            .await
            .unwrap(),
        "before"
    );
}
struct Release(Option<std::sync::mpsc::Sender<()>>);
impl Drop for Release {
    fn drop(&mut self) {
        if let Some(sender) = self.0.take() {
            let _ = sender.send(());
        }
    }
}
#[test]
fn cancellation_waits_for_inflight_flush_before_releasing_workspace() {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .max_blocking_threads(1)
        .build()
        .unwrap();
    runtime.block_on(async {
        let (_directory, service, workspace) = fixture().await;
        workspace
            .write_file("note.md", "accepted buffer")
            .await
            .unwrap();
        let (started_tx, started_rx) = tokio::sync::oneshot::channel();
        let (release_tx, release_rx) = std::sync::mpsc::channel();
        let release = Release(Some(release_tx));
        let blocker = tokio::task::spawn_blocking(move || {
            let _ = started_tx.send(());
            let _ = release_rx.recv();
        });
        started_rx.await.unwrap();
        let (sender, cancel) = watch::channel(false);
        let target = workspace.clone();
        let operation = tokio::spawn(async move {
            let request = resolution(&target);
            resolve(&service, &target, request, cancel, None).await
        });
        tokio::time::timeout(std::time::Duration::from_secs(10), async {
            loop {
                if workspace.mutation.try_lock().is_err() {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap();
        sender.send(true).unwrap();
        tokio::task::yield_now().await;
        assert!(
            !operation.is_finished(),
            "Cancellation must not drop an in-flight filesystem future"
        );
        assert!(
            workspace.mutation.try_lock().is_err(),
            "Mutation gate must cover filesystem completion"
        );
        drop(release);
        blocker.await.unwrap();
        let result = tokio::time::timeout(std::time::Duration::from_secs(10), operation)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(result.err().unwrap().code, "SYNC_CANCELLED");
        assert!(workspace.mutation.try_lock().is_ok());
        assert_eq!(
            tokio::fs::read_to_string(workspace.root_directory().join("note.md"))
                .await
                .unwrap(),
            "accepted buffer"
        );
    });
}
