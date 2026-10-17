use super::{Workspace, WorkspaceRegistry, types::*};
use std::sync::Arc;

pub(super) async fn fixture() -> (tempfile::TempDir, Arc<WorkspaceRegistry>, Arc<Workspace>) {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path().join("notes");
    tokio::fs::create_dir(&root).await.unwrap();
    tokio::fs::write(root.join("a.md"), "A😀B\n").await.unwrap();
    let registry = Arc::new(WorkspaceRegistry::new(&directory.path().join("profile")).unwrap());
    let workspace = registry
        .open_async("main", Some(root.to_str().unwrap()), false)
        .await
        .unwrap();
    (directory, registry, workspace)
}
fn update(workspace: &Workspace, revision: u64, update: BufferUpdate) -> UpdateRequest {
    UpdateRequest {
        path: "a.md".into(),
        base_revision: revision,
        session_generation: workspace.generation,
        update,
    }
}
#[tokio::test]
async fn utf16_patches_are_atomic_versioned_and_reject_split_surrogates() {
    let (_directory, _registry, workspace) = fixture().await;
    workspace.open_file("a.md").await.unwrap();
    let invalid = update(
        &workspace,
        0,
        BufferUpdate::Patch {
            changes: vec![TextChange {
                offset: 2,
                delete_length: 0,
                insert_text: "x".into(),
            }],
        },
    );
    assert_eq!(
        workspace.apply_update(invalid).await.unwrap_err().code,
        "INVALID_REQUEST"
    );
    assert_eq!(workspace.read_file("a.md").await.unwrap(), "A😀B\n");
    let valid = update(
        &workspace,
        0,
        BufferUpdate::Patch {
            changes: vec![TextChange {
                offset: 1,
                delete_length: 2,
                insert_text: "中".into(),
            }],
        },
    );
    assert!(matches!(
        workspace.apply_update(valid).await.unwrap(),
        UpdateResult::Applied {
            revision: 1,
            dirty: true,
            ..
        }
    ));
    let stale = update(
        &workspace,
        0,
        BufferUpdate::Snapshot {
            content: "lost edit".into(),
        },
    );
    assert!(matches!(
        workspace.apply_update(stale).await.unwrap(),
        UpdateResult::ResyncRequired { revision: 1, .. }
    ));
    let mut wrong = update(
        &workspace,
        1,
        BufferUpdate::Snapshot {
            content: "wrong session".into(),
        },
    );
    wrong.session_generation += 1;
    assert!(matches!(
        workspace.apply_update(wrong).await.unwrap(),
        UpdateResult::SessionMismatch { .. }
    ));
    assert_eq!(workspace.read_file("a.md").await.unwrap(), "A中B\n");
}
#[tokio::test]
async fn concurrent_edit_writers_cannot_both_accept_the_same_base_revision() {
    let (_directory, _registry, workspace) = fixture().await;
    let a = workspace.apply_update(update(
        &workspace,
        0,
        BufferUpdate::Snapshot {
            content: "first".into(),
        },
    ));
    let b = workspace.apply_update(update(
        &workspace,
        0,
        BufferUpdate::Snapshot {
            content: "second".into(),
        },
    ));
    let (a, b) = tokio::join!(a, b);
    let results = [a.unwrap(), b.unwrap()];
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, UpdateResult::Applied { .. }))
            .count(),
        1
    );
    assert_eq!(
        results
            .iter()
            .filter(|result| matches!(result, UpdateResult::ResyncRequired { .. }))
            .count(),
        1
    );
}
#[tokio::test]
async fn durable_save_detects_external_conflicts_and_preserves_unsaved_edits() {
    let (_directory, _registry, workspace) = fixture().await;
    let path = workspace.resolve_async("a.md").await.unwrap();
    workspace.write_file("a.md", "our edit").await.unwrap();
    tokio::fs::write(&path, "external edit").await.unwrap();
    assert_eq!(
        workspace.flush_buffers().await.unwrap_err().code,
        "FILE_CONFLICT"
    );
    assert_eq!(
        tokio::fs::read_to_string(&path).await.unwrap(),
        "external edit"
    );
    assert!(
        workspace
            .buffer_status("a.md")
            .await
            .unwrap()
            .unwrap()
            .dirty
    );
    // A disk writer that has already published the identical desired contents
    // is safe to reconcile; the buffer baseline becomes clean only after commit.
    tokio::fs::write(&path, "our edit").await.unwrap();
    assert_eq!(workspace.flush_buffers().await.unwrap(), 1);
    assert!(
        !workspace
            .buffer_status("a.md")
            .await
            .unwrap()
            .unwrap()
            .dirty
    );
    assert_eq!(workspace.flush_buffers().await.unwrap(), 0);
}
#[tokio::test]
async fn disk_refresh_reloads_clean_buffers_and_keeps_dirty_buffers_for_conflict_resolution() {
    let (_directory, _registry, workspace) = fixture().await;
    workspace.open_file("a.md").await.unwrap();
    let path = workspace.resolve_async("a.md").await.unwrap();
    tokio::fs::write(&path, "external").await.unwrap();
    {
        let _guard = workspace.mutation.lock().await;
        workspace.refresh_buffers_from_disk().await.unwrap();
    }
    assert_eq!(workspace.read_file("a.md").await.unwrap(), "external");
    assert_eq!(
        workspace
            .buffer_status("a.md")
            .await
            .unwrap()
            .unwrap()
            .revision,
        1
    );
    workspace.write_file("a.md", "unsaved").await.unwrap();
    tokio::fs::write(&path, "changed again").await.unwrap();
    {
        let _guard = workspace.mutation.lock().await;
        workspace.refresh_buffers_from_disk().await.unwrap();
    }
    assert_eq!(workspace.read_file("a.md").await.unwrap(), "unsaved");
    assert_eq!(
        workspace.flush_buffers().await.unwrap_err().code,
        "FILE_CONFLICT"
    );
}
