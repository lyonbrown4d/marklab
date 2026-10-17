use super::{LanguageService, completion, markdown, mermaid, types::*, utf16};
use crate::{
    analysis::AnalysisService,
    workspace::{RootInfo, Workspace},
};
use std::sync::Arc;

#[test]
fn utf16_ranges_preserve_surrogate_pairs_crlf_and_trailing_empty_lines() {
    let text = "😀alpha\r\nnext\n";
    assert_eq!(
        utf16::offset(
            text,
            Position {
                line: 0,
                character: 2
            }
        )
        .expect("emoji"),
        4
    );
    assert!(
        utf16::offset(
            text,
            Position {
                line: 0,
                character: 1
            }
        )
        .is_err()
    );
    assert_eq!(
        utf16::offset(
            text,
            Position {
                line: 2,
                character: 0
            }
        )
        .expect("last line"),
        text.len()
    );
    let changed = utf16::apply(
        text,
        &Change {
            range: Range {
                start: Position {
                    line: 0,
                    character: 2,
                },
                end: Position {
                    line: 0,
                    character: 7,
                },
            },
            range_length: Some(5),
            text: "beta".into(),
        },
    )
    .expect("change");
    assert_eq!(changed, "😀beta\r\nnext\n");
}

fn open(uri: &str, text: &str) -> OpenRequest {
    OpenRequest {
        uri: uri.into(),
        language_id: "markdown".into(),
        path: Some("start.md".into()),
        version: 1,
        text: text.into(),
    }
}

#[tokio::test]
async fn language_documents_enforce_owner_versions_consumer_counts_and_atomic_batch_failure() {
    let service = LanguageService::default();
    service
        .open("first".into(), open("editor", "😀alpha"))
        .await
        .expect("open");
    service
        .open("first".into(), open("editor", "😀alpha"))
        .await
        .expect("second consumer");
    assert!(
        service
            .snapshot("second".into(), "editor".into(), 1)
            .await
            .is_err()
    );
    assert!(
        service
            .open("first".into(), open("editor", "different"))
            .await
            .is_err()
    );
    let failure = ChangeRequest {
        uri: "editor".into(),
        version: 2,
        changes: vec![
            Change {
                range: Range {
                    start: Position {
                        line: 0,
                        character: 2,
                    },
                    end: Position {
                        line: 0,
                        character: 7,
                    },
                },
                range_length: None,
                text: "beta".into(),
            },
            Change {
                range: Range {
                    start: Position {
                        line: 4,
                        character: 0,
                    },
                    end: Position {
                        line: 4,
                        character: 1,
                    },
                },
                range_length: None,
                text: "bad".into(),
            },
        ],
    };
    assert!(service.change("first".into(), failure).await.is_err());
    assert_eq!(
        service
            .snapshot("first".into(), "editor".into(), 1)
            .await
            .expect("unchanged")
            .text
            .as_ref(),
        "😀alpha"
    );
    service
        .close(
            "first".into(),
            CloseRequest {
                uri: "editor".into(),
            },
        )
        .await
        .expect("close one");
    assert!(
        service
            .snapshot("first".into(), "editor".into(), 1)
            .await
            .is_ok()
    );
    service
        .close(
            "first".into(),
            CloseRequest {
                uri: "editor".into(),
            },
        )
        .await
        .expect("close last");
    assert!(
        service
            .snapshot("first".into(), "editor".into(), 1)
            .await
            .is_err()
    );
}

#[test]
fn native_mermaid_parser_reports_real_errors_and_keeps_completion_catalog() {
    assert_eq!(
        mermaid::diagnostics("flowchart TD\n  A --> B", 0),
        serde_json::json!([])
    );
    assert!(
        !mermaid::diagnostics("flowchart TD\n  A --> [", 4)
            .as_array()
            .expect("diagnostics")
            .is_empty()
    );
    let completion = mermaid::completion(
        "sequenceDiagram\n  ",
        Position {
            line: 1,
            character: 2,
        },
    )
    .expect("completion");
    assert!(
        completion["items"]
            .as_array()
            .expect("items")
            .iter()
            .any(|item| item["label"] == "participant")
    );
    let blocks = mermaid::blocks("# Doc\n\n```mermaid\nflowchart TD\n  A --> B\n```\n");
    assert_eq!(blocks.len(), 1);
    assert_eq!(blocks[0].start_line, 3);
}

#[tokio::test]
async fn definitions_references_heading_completion_and_quick_fixes_use_native_index() {
    let directory = tempfile::tempdir().expect("workspace");
    tokio::fs::write(directory.path().join("target.md"), "# Target\n\n## Details")
        .await
        .expect("target");
    tokio::fs::write(
        directory.path().join("start.md"),
        "# Start\n\n[Go](target.md#details)",
    )
    .await
    .expect("source");
    let workspace = Arc::new(Workspace::new(
        RootInfo {
            kind: "external".into(),
            path: directory.path().to_string_lossy().into_owned(),
        },
        2,
    ));
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("SQLite");
    let analysis = AnalysisService::new(pool);
    let index = analysis.index(workspace).await.expect("index");
    let request = MarkdownRequest {
        path: Some("start.md".into()),
        content: "# Start\n\n[Go](target.md#details)".into(),
        line: 3,
        column: 9,
        new_name: None,
    };
    assert_eq!(markdown::definition(&index, &request)["path"], "target.md");
    assert_eq!(markdown::definition(&index, &request)["line"], 3);
    assert_eq!(
        markdown::references(&index, &request)
            .as_array()
            .expect("references")
            .len(),
        1
    );
    let service = LanguageService::default();
    service
        .open("window".into(), open("completion", "[Go](target.md#de"))
        .await
        .expect("session");
    let document = service
        .snapshot("window".into(), "completion".into(), 1)
        .await
        .expect("snapshot");
    let completion = completion::completion(
        &index,
        &document,
        Position {
            line: 0,
            character: 17,
        },
    )
    .expect("heading completion");
    assert!(
        completion["items"]
            .as_array()
            .expect("items")
            .iter()
            .any(|item| item["insertText"] == "details")
    );
    let request = MarkdownRequest {
        content: "[Missing](missing.md)".into(),
        line: 1,
        column: 12,
        ..request
    };
    let index = markdown::overlay(&index, &request).expect("overlay");
    assert_eq!(
        markdown::code_actions(&index, &request)[0]["kind"],
        "create-file"
    );
}
