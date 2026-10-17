use super::*;
use crate::database::Database;
fn root(path: &str) -> RootInfo {
    let portable = if !std::path::Path::new(path).is_absolute() && path.starts_with('/') {
        std::env::temp_dir()
            .join(path.trim_start_matches('/'))
            .to_string_lossy()
            .into_owned()
    } else {
        path.to_string()
    };
    let path = portable.as_str();
    RootInfo {
        kind: "external".into(),
        path: path.into(),
    }
}
#[tokio::test]
async fn capture_merges_deduplicates_prunes_and_isolates_workspaces() -> BackendResult<()> {
    let directory = tempfile::tempdir()?;
    let database = Database::open(directory.path()).await?;
    let mut store = HistoryStore::new(database.pool.clone());
    store.max_entries = 2;
    let workspace = root("/notes");
    let now = 1_700_000_000_000;
    assert!(matches!(
        store.capture_at(&workspace, "note.md", "one", now).await?,
        CaptureResult::Created { .. }
    ));
    assert!(matches!(
        store
            .capture_at(&workspace, "note.md", "one", now + 1)
            .await?,
        CaptureResult::Skipped {
            reason: "duplicate"
        }
    ));
    assert!(matches!(
        store
            .capture_at(&workspace, "note.md", "two", now + 10_000)
            .await?,
        CaptureResult::Merged { .. }
    ));
    store
        .capture_at(&workspace, "note.md", "three", now + 30_000)
        .await?;
    store
        .capture_at(&workspace, "note.md", "four", now + 50_000)
        .await?;
    let entries = store.list(&workspace, "note.md").await?;
    assert_eq!(entries.len(), 2);
    assert_eq!(
        store
            .read(&workspace, "note.md", &entries[0].id)
            .await?
            .content,
        "four"
    );
    assert_eq!(
        store
            .read(&workspace, "note.md", &entries[1].id)
            .await?
            .content,
        "three"
    );
    assert!(store.list(&root("/other"), "note.md").await?.is_empty());
    assert!(
        store
            .read(&root("/other"), "note.md", &entries[0].id)
            .await
            .is_err()
    );
    assert!(
        store
            .delete(&root("/other"), "note.md", &entries[0].id)
            .await
            .is_err()
    );
    assert_eq!(store.list(&workspace, "note.md").await?.len(), 2);
    assert_eq!(store.clear(&workspace, "note.md").await?.deleted, 2);
    assert!(
        store
            .read(&workspace, "note.md", &entries[0].id)
            .await
            .is_err()
    );
    database.pool.close().await;
    Ok(())
}
#[tokio::test]
async fn rejects_unsafe_paths_and_invalid_ids_without_losing_history() -> BackendResult<()> {
    let directory = tempfile::tempdir()?;
    let database = Database::open(directory.path()).await?;
    let store = HistoryStore::new(database.pool.clone());
    let workspace = root("/notes");
    store
        .capture_at(&workspace, "folder\\note.md", "ok", 1_700_000_000_000)
        .await?;
    for path in [
        "../note.md",
        "/note.md",
        "C:\\note.md",
        "file:note.md",
        "a/../note.md",
        "\0",
    ] {
        assert!(
            store
                .capture_at(&workspace, path, "bad", 1_700_000_000_001)
                .await
                .is_err()
        );
    }
    assert!(
        store
            .read(&workspace, "folder/note.md", &"é".repeat(25))
            .await
            .is_err()
    );
    assert!(matches!(
        store
            .capture_snapshot(&workspace, "large.md", &"a".repeat(256 * 1024 + 1))
            .await?,
        CaptureResult::Skipped {
            reason: "file-too-large"
        }
    ));
    assert_eq!(store.list(&workspace, "folder/note.md").await?.len(), 1);
    assert!(store.list(&workspace, "large.md").await?.is_empty());
    database.pool.close().await;
    Ok(())
}

#[tokio::test]
async fn restores_through_the_authoritative_buffer_and_reports_disk_conflicts() -> BackendResult<()>
{
    let directory = tempfile::tempdir()?;
    let database = Database::open(directory.path()).await?;
    let store = HistoryStore::new(database.pool.clone());
    let notes = directory.path().join("notes");
    tokio::fs::create_dir(&notes).await?;
    tokio::fs::write(notes.join("note.md"), "original").await?;
    let info = root(&notes.to_string_lossy());
    store
        .capture_at(&info, "note.md", "original", 1_700_000_000_000)
        .await?;
    let id = store.list(&info, "note.md").await?[0].id.clone();
    let workspace = crate::workspace::Workspace::new(info, 1);
    workspace.write_file("note.md", "edited").await?;
    workspace.flush_buffers().await?;
    let restored = store.restore(&workspace, "note.md", &id).await?;
    assert_eq!(restored.content, "original");
    assert_eq!(workspace.read_file("note.md").await?, "original");
    assert_eq!(
        tokio::fs::read_to_string(notes.join("note.md")).await?,
        "original"
    );
    tokio::fs::write(notes.join("note.md"), "external edit").await?;
    assert!(store.restore(&workspace, "note.md", &id).await.is_err());
    assert_eq!(
        tokio::fs::read_to_string(notes.join("note.md")).await?,
        "external edit"
    );
    database.pool.close().await;
    Ok(())
}
