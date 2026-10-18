use super::{MarkdownRequest, code_actions, hover, overlay};
use crate::{
    analysis::{AnalysisService, Index},
    workspace::{RootInfo, Workspace},
};
use std::sync::Arc;

async fn fixture() -> (tempfile::TempDir, Arc<Index>) {
    let directory = tempfile::tempdir().unwrap();
    tokio::fs::write(
        directory.path().join("target.md"),
        "# Other\n\n## Alpha\n\n## Beta\n\n## Details\n",
    )
    .await
    .unwrap();
    tokio::fs::write(directory.path().join("source.md"), "source")
        .await
        .unwrap();
    tokio::fs::write(directory.path().join("picture.png"), b"fixture")
        .await
        .unwrap();
    let workspace = Arc::new(Workspace::new(
        RootInfo {
            kind: "external".into(),
            path: directory
                .path()
                .canonicalize()
                .unwrap()
                .to_string_lossy()
                .into_owned(),
        },
        7,
    ));
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .unwrap();
    let index = AnalysisService::new(pool).index(workspace).await.unwrap();
    (directory, index)
}

fn request(content: &str) -> MarkdownRequest {
    MarkdownRequest {
        path: Some("source.md".into()),
        content: content.into(),
        line: 1,
        column: 3,
        new_name: None,
    }
}

#[tokio::test]
async fn missing_anchor_fix_ranks_later_close_heading_first_and_limits_suggestions() {
    let (_directory, index) = fixture().await;
    let request = request("😀 [Go](target.md#detail)");
    let request = MarkdownRequest {
        column: 8,
        ..request
    };
    let index = overlay(&index, &request).unwrap();
    let actions = code_actions(&index, &request);
    let actions = actions.as_array().unwrap();
    assert_eq!(actions.len(), 4);
    assert_eq!(actions[0]["edit"]["newText"], "#details");
    assert_eq!(actions[0]["isPreferred"], true);
    assert!(
        actions[1..]
            .iter()
            .all(|action| action["isPreferred"] == false)
    );
    let edit = &actions[0]["edit"];
    let after = super::utf16::apply(
        &request.content,
        &super::super::types::Change {
            range: super::super::types::Range {
                start: super::super::types::Position {
                    line: 0,
                    character: edit["startColumn"].as_u64().unwrap() as usize - 1,
                },
                end: super::super::types::Position {
                    line: 0,
                    character: edit["endColumn"].as_u64().unwrap() as usize - 1,
                },
            },
            range_length: None,
            text: edit["newText"].as_str().unwrap().into(),
        },
    )
    .unwrap();
    assert_eq!(after, "😀 [Go](target.md#details)");
}

#[tokio::test]
async fn anchor_fixes_require_an_exact_writable_destination_and_local_asset_hover_stays_useful() {
    let (_directory, index) = fixture().await;
    for content in [
        "[Go][ref]\n\n[ref]: target.md#detail",
        "[Go](target.md#de&#116;ail)",
    ] {
        let request = request(content);
        let index = overlay(&index, &request).unwrap();
        assert_eq!(
            code_actions(&index, &request),
            serde_json::json!([]),
            "{content}"
        );
    }
    for content in ["[Image](picture.png)", "[Image](picture.png#fragment)"] {
        let request = request(content);
        let index = overlay(&index, &request).unwrap();
        let hover = hover(&index, &request);
        assert_eq!(hover["path"], "picture.png");
        assert!(hover["heading"].is_null());
        assert_eq!(
            hover["markdown"],
            "### Local file\n\n`picture.png`\n\nThis workspace file can be opened as a preview."
        );
    }
}
