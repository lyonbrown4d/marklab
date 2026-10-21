use super::document::{Heading, Link, LinkKind};
pub use AnalysisPageResult as PageResult;
use serde::Serialize;

#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisPageResult {
  pub ready: bool,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub revision: u64,
  pub items: Vec<PageItem>,
  pub folders: Vec<String>,
  pub total: usize,
  pub offset: usize,
  pub limit: usize,
}
pub use AnalysisPageItem as PageItem;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisPageItem {
  pub path: String,
  pub title: String,
  pub folder: String,
  pub heading_count: usize,
  pub link_count: usize,
  pub asset_count: usize,
  pub issue_count: usize,
}
pub use AnalysisNavigationResult as NavigationResult;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisNavigationResult {
  pub ready: bool,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub revision: u64,
  pub active_path: Option<String>,
  pub files: Vec<NavigationFile>,
  pub headings: Vec<Heading>,
  pub file_total: usize,
  pub heading_total: usize,
  pub current: NavigationCurrent,
  pub limit: usize,
}
pub use AnalysisNavigationFile as NavigationFile;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisNavigationFile {
  pub path: String,
  pub title: String,
}
pub use AnalysisNavigationCurrent as NavigationCurrent;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisNavigationCurrent {
  pub headings: Vec<Heading>,
  pub outgoing_links: Vec<Link>,
  pub backlinks: Vec<Backlink>,
  pub missing_links: Vec<MissingLink>,
  pub heading_total: usize,
  pub outgoing_link_total: usize,
  pub backlink_total: usize,
  pub missing_link_total: usize,
}
pub use AnalysisBacklink as Backlink;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisBacklink {
  pub source_path: String,
  pub text: String,
  pub context: String,
  pub line: usize,
  pub column: usize,
  pub target_anchor: Option<String>,
  pub target_heading_slug: Option<String>,
}
pub use AnalysisMissingLink as MissingLink;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisMissingLink {
  pub path: String,
  #[serde(flatten)]
  pub link: MissingTarget,
}
pub use AnalysisMissingTarget as MissingTarget;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisMissingTarget {
  pub target: String,
  pub text: String,
  pub context: String,
  pub line: usize,
  pub column: usize,
  pub link_type: LinkKind,
}
impl From<&Link> for MissingTarget {
  fn from(link: &Link) -> Self {
    Self {
      target: link.target.clone(),
      text: link.text.clone(),
      context: link.context.clone(),
      line: link.line,
      column: link.column,
      link_type: link.link_type,
    }
  }
}
pub use AnalysisKnowledgeSummary as KnowledgeSummary;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisKnowledgeSummary {
  pub ready: bool,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub revision: u64,
  pub file_count: usize,
  pub heading_count: usize,
  pub internal_link_count: usize,
  pub linked_file_count: usize,
  pub missing_link_count: usize,
  pub orphan_file_count: usize,
  pub collection_counts: CollectionCounts,
}
pub use AnalysisCollectionCounts as CollectionCounts;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisCollectionCounts {
  pub all: usize,
  #[serde(rename = "needs-attention")]
  pub needs_attention: usize,
  pub linked: usize,
  pub structured: usize,
}
pub use AnalysisInsightsResult as InsightsResult;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisInsightsResult {
  pub ready: bool,
  #[serde(with = "crate::ipc_number")]
  #[specta(type = u64)]
  pub revision: u64,
  pub path: String,
  pub found: bool,
  pub headings: Vec<Heading>,
  pub backlinks: Vec<Backlink>,
  pub diagnostics: Vec<Diagnostic>,
  pub asset_report: AssetReport,
  pub knowledge: KnowledgeReport,
}
pub use AnalysisDiagnostic as Diagnostic;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisDiagnostic {
  pub line: usize,
  pub start_column: usize,
  pub end_column: usize,
  pub message: String,
  pub severity: DiagnosticSeverity,
}
pub use AnalysisDiagnosticSeverity as DiagnosticSeverity;
#[derive(Debug, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisDiagnosticSeverity {
  Warning,
}
pub use AnalysisAssetReport as AssetReport;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisAssetReport {
  pub current_assets: Vec<AssetReference>,
  pub current_asset_count: usize,
  pub current_missing_count: usize,
  pub workspace_missing_assets: Vec<AssetReference>,
  pub workspace_missing_count: usize,
  pub limit: usize,
}
pub use AnalysisAssetReference as AssetReference;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisAssetReference {
  pub id: String,
  pub source_path: String,
  pub target: String,
  pub target_path: Option<String>,
  pub media_type: Option<String>,
  pub context: String,
  pub line: usize,
  pub column: usize,
  pub status: AssetStatus,
}
pub use AnalysisAssetStatus as AssetStatus;
#[derive(Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AnalysisAssetStatus {
  Available,
  Missing,
  Unverified,
}
pub use AnalysisKnowledgeReport as KnowledgeReport;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisKnowledgeReport {
  pub incoming: Vec<KnowledgeLink>,
  pub outgoing: Vec<KnowledgeLink>,
  pub missing: Vec<MissingTarget>,
  pub incoming_count: usize,
  pub outgoing_count: usize,
  pub missing_count: usize,
  pub orphan: bool,
}
pub use AnalysisKnowledgeLink as KnowledgeLink;
#[derive(Debug, Serialize, specta::Type)]
pub struct AnalysisKnowledgeLink {
  pub path: String,
  pub label: String,
  pub count: usize,
  pub first_line: usize,
  pub first_column: usize,
  pub first_text: String,
  pub first_context: String,
}
