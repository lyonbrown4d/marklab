use crate::workspace::{
    tests::fixture,
    types::{BufferUpdate, UpdateRequest, UpdateResult},
};

#[tokio::test]
async fn file_rename_updates_destinations_and_preserves_drafts_aliases_and_anchors() {
    let (_directory, registry, workspace) = fixture().await;
    let root = workspace.root_directory();
    tokio::fs::write(root.join("target.md"), "# Old\n[#self](#old)\n")
        .await
        .unwrap();
    workspace
        .write_file(
            "a.md",
            concat!(
                "draft 😀\r\n[target.md#old](target.md#old)\r\n",
                "[[target#old|display name]]\r\n",
                "![image](target.md#old)\r\n",
                "`[code](target.md)`\r\n",
            ),
        )
        .await
        .unwrap();
    let shared = registry
        .open_async("second", Some(root.to_str().unwrap()), false)
        .await
        .unwrap();
    workspace
        .move_path("target.md", "renamed.md")
        .await
        .unwrap();
    let expected = concat!(
        "draft 😀\r\n[target.md#old](renamed.md#old)\r\n",
        "[[renamed#old|display name]]\r\n",
        "![image](target.md#old)\r\n",
        "`[code](target.md)`\r\n",
    );
    assert_eq!(shared.read_file("a.md").await.unwrap(), expected);
    assert_eq!(
        workspace.read_file("renamed.md").await.unwrap(),
        "# Old\n[#self](#old)\n"
    );
    assert!(shared.buffer_status("a.md").await.unwrap().unwrap().dirty);
    // The backend rewrite invalidates the editor's previous buffer revision.
    assert!(matches!(
        shared
            .apply_update(UpdateRequest {
                path: "a.md".into(),
                base_revision: 1,
                session_generation: shared.generation,
                update: BufferUpdate::Snapshot {
                    content: "stale renderer".into()
                },
            })
            .await
            .unwrap(),
        UpdateResult::ResyncRequired { .. }
    ));
    workspace.flush_buffers().await.unwrap();
    assert_eq!(
        tokio::fs::read_to_string(root.join("a.md")).await.unwrap(),
        expected
    );
}

#[tokio::test]
async fn directory_move_resolves_targets_before_the_move_and_uses_new_source_paths() {
    let (_directory, _registry, workspace) = fixture().await;
    let root = workspace.root_directory();
    tokio::fs::create_dir(root.join("old")).await.unwrap();
    tokio::fs::create_dir(root.join("parent")).await.unwrap();
    tokio::fs::write(root.join("old/target.markdown"), "# Target")
        .await
        .unwrap();
    tokio::fs::write(
        root.join("old/source.md"),
        "[target](target.markdown#target)\n[[target|alias]]",
    )
    .await
    .unwrap();
    tokio::fs::write(root.join("a.md"), "[target](old/target.markdown#target)")
        .await
        .unwrap();
    workspace.move_path("old", "parent/new").await.unwrap();
    assert_eq!(
        workspace.read_file("parent/new/source.md").await.unwrap(),
        "[target](target.markdown#target)\n[[target|alias]]"
    );
    assert_eq!(
        workspace.read_file("a.md").await.unwrap(),
        "[target](parent/new/target.markdown#target)"
    );
    assert!(!root.join("old").exists());
    workspace.flush_buffers().await.unwrap();
    assert_eq!(
        tokio::fs::read_to_string(root.join("a.md")).await.unwrap(),
        "[target](parent/new/target.markdown#target)"
    );
}

#[tokio::test]
async fn renamed_reference_drafts_keep_the_disk_baseline_for_save_conflicts() {
    let (_directory, _registry, workspace) = fixture().await;
    let root = workspace.root_directory();
    tokio::fs::write(root.join("target.md"), "# Target")
        .await
        .unwrap();
    tokio::fs::write(root.join("a.md"), "[target](target.md)")
        .await
        .unwrap();
    workspace
        .move_path("target.md", "renamed.md")
        .await
        .unwrap();
    tokio::fs::write(root.join("a.md"), "external edit after rename")
        .await
        .unwrap();
    assert_eq!(
        workspace.flush_buffers().await.unwrap_err().code,
        "FILE_CONFLICT"
    );
    assert_eq!(
        tokio::fs::read_to_string(root.join("a.md")).await.unwrap(),
        "external edit after rename"
    );
    assert_eq!(
        workspace.read_file("a.md").await.unwrap(),
        "[target](renamed.md)"
    );
    assert!(
        workspace
            .buffer_status("a.md")
            .await
            .unwrap()
            .unwrap()
            .dirty
    );
}

#[tokio::test]
async fn dirty_external_conflict_prevents_the_move_and_keeps_the_draft() {
    let (_directory, _registry, workspace) = fixture().await;
    let root = workspace.root_directory();
    tokio::fs::write(root.join("target.md"), "# Target")
        .await
        .unwrap();
    workspace
        .write_file("a.md", "draft [target](target.md)")
        .await
        .unwrap();
    tokio::fs::write(root.join("a.md"), "external edit")
        .await
        .unwrap();
    assert_eq!(
        workspace
            .move_path("target.md", "renamed.md")
            .await
            .unwrap_err()
            .code,
        "FILE_CONFLICT"
    );
    assert!(root.join("target.md").exists());
    assert!(!root.join("renamed.md").exists());
    assert_eq!(
        workspace.read_file("a.md").await.unwrap(),
        "draft [target](target.md)"
    );
    assert_eq!(
        tokio::fs::read_to_string(root.join("a.md")).await.unwrap(),
        "external edit"
    );
}

#[tokio::test]
async fn fresh_disk_content_is_used_and_unsafe_destination_locations_are_skipped() {
    let (_directory, _registry, workspace) = fixture().await;
    let root = workspace.root_directory();
    tokio::fs::write(root.join("target.md"), "# Target")
        .await
        .unwrap();
    workspace.open_file("a.md").await.unwrap();
    let content = concat!(
        "external [target](target.md#old)\n",
        "[reference][target.md]\n\n[target.md]: target.md\n",
        "[escaped](target\\.md)\n",
        "[[target#old|name]]\n",
    );
    tokio::fs::write(root.join("a.md"), content).await.unwrap();
    workspace
        .move_path("target.md", "new name#part.md")
        .await
        .unwrap();
    assert_eq!(
        workspace.read_file("a.md").await.unwrap(),
        concat!(
            "external [target](new%20name%23part.md#old)\n",
            "[reference][target.md]\n\n[target.md]: target.md\n",
            "[escaped](target\\.md)\n",
            "[[new name%23part#old|name]]\n",
        )
    );
    workspace.flush_buffers().await.unwrap();
    assert!(
        !workspace
            .buffer_status("a.md")
            .await
            .unwrap()
            .unwrap()
            .dirty
    );
}

#[tokio::test]
async fn single_file_rename_only_rewrites_its_own_links() {
    let (_directory, registry, folder) = fixture().await;
    let root = folder.root_directory();
    tokio::fs::write(
        root.join("a.md"),
        "[self](a.md#old)\n[[a#old|alias]]\n[anchor](#old)",
    )
    .await
    .unwrap();
    tokio::fs::write(root.join("outside.md"), "[a](a.md)")
        .await
        .unwrap();
    let workspace = registry
        .open_async("single", Some(root.join("a.md").to_str().unwrap()), true)
        .await
        .unwrap();
    workspace.move_path("a.md", "renamed.md").await.unwrap();
    assert_eq!(
        workspace.read_file("renamed.md").await.unwrap(),
        "[self](renamed.md#old)\n[[renamed#old|alias]]\n[anchor](#old)"
    );
    assert_eq!(
        tokio::fs::read_to_string(root.join("outside.md"))
            .await
            .unwrap(),
        "[a](a.md)"
    );
    workspace.flush_buffers().await.unwrap();
}

#[tokio::test]
async fn occupied_destination_does_not_publish_reference_rewrites() {
    let (_directory, _registry, workspace) = fixture().await;
    let root = workspace.root_directory();
    tokio::fs::write(root.join("target.md"), "# Target")
        .await
        .unwrap();
    tokio::fs::write(root.join("taken.md"), "must survive")
        .await
        .unwrap();
    tokio::fs::write(root.join("a.md"), "[target](target.md)")
        .await
        .unwrap();
    assert!(workspace.move_path("target.md", "taken.md").await.is_err());
    assert_eq!(
        workspace.read_file("a.md").await.unwrap(),
        "[target](target.md)"
    );
    assert_eq!(
        tokio::fs::read_to_string(root.join("taken.md"))
            .await
            .unwrap(),
        "must survive"
    );
    assert!(root.join("target.md").exists());
    assert!(workspace.buffer_status("a.md").await.unwrap().is_none());
}
