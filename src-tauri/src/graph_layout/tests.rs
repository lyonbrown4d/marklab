use super::*;
use crate::database::Database;
fn request(revision: &str) -> GraphLayoutRequest {
    GraphLayoutRequest {
        engine_version: "v1".into(),
        graph_revision: revision.into(),
        layout_key: "overview".into(),
        mode: "overview".into(),
    }
}
fn value() -> GraphLayoutSave {
    GraphLayoutSave {
        engine_version: "v1".into(),
        graph_revision: "r1".into(),
        layout_key: "overview".into(),
        mode: "overview".into(),
        nodes: vec![GraphLayoutNode {
            id: "node-a".into(),
            x: 100.0,
            y: 200.0,
            width: 200.0,
            height: 80.0,
            collapsed: false,
            pinned: true,
            user_modified: true,
        }],
        viewport: Some(GraphLayoutViewport {
            x: 10.0,
            y: 20.0,
            zoom: 0.5,
        }),
    }
}
#[tokio::test]
async fn exact_stale_and_workspace_miss_preserve_atomic_layouts() -> BackendResult<()> {
    let directory = tempfile::tempdir()?;
    let database = Database::open(directory.path()).await?;
    let store = GraphLayoutStore::new(database.pool.clone());
    let root = RootInfo {
        kind: "external".into(),
        path: directory
            .path()
            .join("first")
            .to_string_lossy()
            .into_owned(),
    };
    store.save(&root, value()).await?;
    let exact = store.get(&root, request("r1")).await?;
    assert_eq!(exact.r#match, "exact");
    assert_eq!(exact.viewport.unwrap().zoom, 0.5);
    let stale = store.get(&root, request("r2")).await?;
    assert_eq!(stale.r#match, "stale");
    assert!(stale.viewport.is_none());
    assert_eq!(stale.nodes[0].x, 100.0);
    let second = RootInfo {
        kind: "external".into(),
        path: directory
            .path()
            .join("second")
            .to_string_lossy()
            .into_owned(),
    };
    assert_eq!(store.get(&second, request("r1")).await?.r#match, "miss");
    let mut invalid = value();
    invalid.nodes.push(invalid.nodes[0].clone());
    assert!(store.save(&root, invalid).await.is_err());
    assert_eq!(store.get(&root, request("r1")).await?.nodes.len(), 1);
    database.pool.close().await;
    Ok(())
}
