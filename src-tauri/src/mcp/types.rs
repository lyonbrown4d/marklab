use rmcp::schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
pub(super) struct Empty {}

#[derive(Deserialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(deny_unknown_fields)]
pub(super) struct SearchInput {
    #[schemars(length(min = 1, max = 1024))]
    pub query: String,
    #[serde(default, deserialize_with = "optional_limit")]
    #[schemars(with = "usize", range(min = 1, max = 50))]
    pub limit: Option<usize>,
}

fn optional_limit<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<usize>, D::Error> {
    usize::deserialize(deserializer).map(Some)
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(rename_all = "camelCase")]
pub(super) struct Status {
    pub workspace_root: String,
    pub engine_data_dir: String,
    pub health: Health,
    pub index: IndexStatus,
    pub storage: Storage,
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(rename_all = "camelCase")]
pub(super) struct Health {
    pub ok: bool,
    pub state: String,
    pub metadata_documents: String,
    pub searchable_documents: String,
    pub pending_outbox_events: String,
    pub warnings: Vec<String>,
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(rename_all = "camelCase")]
pub(super) struct IndexStatus {
    pub search_index: String,
    pub ready: bool,
    pub metadata_documents: String,
    pub searchable_documents: String,
    pub pending_outbox_events: String,
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(rename_all = "camelCase")]
pub(super) struct Storage {
    pub metadata_store: String,
    pub search_index: String,
    /// UTF-8 serialized metadata payload bytes for this workspace scope.
    pub metadata_bytes: String,
    /// Logical UTF-8 path/title/content bytes, excluding SQLite page overhead.
    pub search_index_bytes: String,
    pub total_bytes: String,
    pub metadata_documents: String,
    pub pending_outbox_events: String,
    pub blob_store: bool,
    pub blob_bytes: String,
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchOutput {
    pub query: String,
    pub limit: usize,
    pub total_hits: usize,
    pub result_count: usize,
    pub results: Vec<SearchHit>,
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
#[serde(rename_all = "camelCase")]
pub(super) struct SearchHit {
    pub document_id: String,
    pub path: String,
    pub title: String,
    pub line: usize,
    pub column: usize,
    pub end_column: usize,
    pub snippet: String,
    pub snippet_highlights: Vec<Highlight>,
    pub score: f64,
}

#[derive(Serialize, JsonSchema)]
#[schemars(crate = "rmcp::schemars")]
pub(super) struct Highlight {
    pub start: usize,
    pub end: usize,
}

impl From<crate::analysis::SearchResult> for SearchHit {
    fn from(hit: crate::analysis::SearchResult) -> Self {
        Self {
            document_id: hit.path.clone(),
            path: hit.path,
            title: hit.title,
            line: hit.line,
            column: hit.column,
            end_column: hit.end_column,
            snippet: hit.snippet,
            score: hit.score,
            snippet_highlights: hit
                .snippet_highlights
                .into_iter()
                .map(|span| Highlight {
                    start: span.start,
                    end: span.end,
                })
                .collect(),
        }
    }
}
