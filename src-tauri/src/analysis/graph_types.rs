use super::graph_preview::Preview;
pub use AnalysisWorkspaceGraph as WorkspaceGraph;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, specta::Type)]
pub struct AnalysisWorkspaceGraph {
  pub mode: GraphMode,
  pub revision: String,
  pub topology_key: String,
  pub nodes: Vec<GraphNode>,
  pub edges: Vec<GraphEdge>,
  pub truncated: bool,
  pub total_nodes: usize,
  pub total_edges: usize,
}
pub use AnalysisGraphMode as GraphMode;
#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisGraphMode {
  Relations,
}
pub use AnalysisGraphNode as GraphNode;
#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AnalysisGraphNode {
  File {
    id: String,
    label: String,
    path: String,
    group: GraphGroup,
  },
  Preview {
    id: String,
    label: String,
    path: String,
    source_path: String,
    target: String,
    preview_kind: PreviewKind,
  },
  Missing {
    id: String,
    label: String,
    path: String,
    source_path: String,
    target: String,
    preview_kind: PreviewKind,
  },
}
pub use AnalysisGraphGroup as GraphGroup;
#[derive(Debug, Serialize, Deserialize, specta::Type)]
pub struct AnalysisGraphGroup {
  pub key: String,
  pub label: String,
  pub source: GroupSource,
}
pub use AnalysisGroupSource as GroupSource;
#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisGroupSource {
  Path,
}
pub use AnalysisPreviewKind as PreviewKind;
#[derive(Debug, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisPreviewKind {
  Audio,
  Docx,
  Drawio,
  Excalidraw,
  Image,
  Pdf,
  Source,
  Spreadsheet,
  Video,
}
pub use AnalysisGraphEdge as GraphEdge;
#[derive(Debug, Serialize, Deserialize, specta::Type)]
pub struct AnalysisGraphEdge {
  pub id: String,
  pub source: String,
  pub target: String,
  pub kind: EdgeKind,
  pub count: usize,
}
pub use AnalysisEdgeKind as EdgeKind;
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum AnalysisEdgeKind {
  LinksTo,
  ReferencesHeading,
  Previews,
}
pub use AnalysisGraphDetails as GraphDetails;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisGraphDetails {
  pub items: Vec<GraphDetail>,
  pub revision: String,
  pub truncated: bool,
}
pub use AnalysisGraphDetail as GraphDetail;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisGraphDetail {
  pub id: String,
  pub content: String,
  pub preview: Preview,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub content_blocks: Option<Vec<MarkdownBlock>>,
}
pub use AnalysisMarkdownBlock as MarkdownBlock;
#[derive(Debug, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum AnalysisMarkdownBlock {
  Code {
    id: String,
    text: String,
    language: String,
  },
  Paragraph {
    id: String,
    text: String,
  },
  Blockquote {
    id: String,
    text: String,
  },
}
pub use AnalysisPublicationPlan as PublicationPlan;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisPublicationPlan {
  pub title: String,
  pub estimated_pages: usize,
  pub orphan_count: usize,
  pub total_words: usize,
  pub chapters: Vec<PublicationChapter>,
}
pub use AnalysisPublicationChapter as PublicationChapter;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisPublicationChapter {
  pub path: String,
  pub title: String,
  pub depth: usize,
  pub orphaned: bool,
  pub word_count: usize,
  pub estimated_pages: usize,
  pub excerpt: String,
}

pub use AnalysisWorkspaceGraphRequest as WorkspaceGraphRequest;
#[derive(Clone, Debug, Serialize, Deserialize, specta::Type)]
#[serde(deny_unknown_fields)]
pub struct AnalysisWorkspaceGraphRequest {
  #[serde(deserialize_with = "required_center_path")]
  #[specta(type = Option<String>)]
  pub center_path: Option<String>,
  pub depth: u8,
  pub direction: GraphDirection,
  pub include_attachments: bool,
  pub include_missing: bool,
  pub max_nodes: usize,
  pub max_edges: usize,
}

fn required_center_path<'de, D: serde::Deserializer<'de>>(
  deserializer: D,
) -> Result<Option<String>, D::Error> {
  Option::deserialize(deserializer)
}

pub use AnalysisGraphDirection as GraphDirection;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisGraphDirection {
  Both,
  Incoming,
  Outgoing,
}
