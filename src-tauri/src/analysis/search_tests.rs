use super::{
  AnalysisService, document,
  search::{OccurrenceOptions, OccurrenceRequest, SearchRequest},
  search_text,
};
use crate::{
  database::Database,
  workspace::{RootInfo, Workspace},
};
use std::sync::{Arc, atomic::AtomicBool};

#[tokio::test]
async fn shared_search_preserves_multi_term_folding_prefix_fuzzy_cjk_and_exact_counts() {
  let root = tempfile::tempdir().unwrap();
  let data = tempfile::tempdir().unwrap();
  for (path, content) in [
    ("Café Plan.md", "# Résumé\nLaunch details live here.\n"),
    (
      "collaboration.md",
      "# Collaboration Protocol\nA durable workspace protocol.\n",
    ),
    ("fuzzy.md", "# ABCDE\nA zero-shared-trigram fixture.\n"),
    ("规划路线.md", "# 本地知识库\n沉浸式全文搜索体验\n"),
    ("cpp.md", "# C++ Guide\nLiteral (alpha:beta) syntax.\n"),
    ("unicode.md", "🙂 Café 搜索\n"),
  ] {
    tokio::fs::write(root.path().join(path), content)
      .await
      .unwrap();
  }
  let database = Database::open(data.path()).await.unwrap();
  let analysis = AnalysisService::new(database.pool.clone());
  let workspace = Arc::new(Workspace::new(
    RootInfo {
      kind: crate::workspace::RootKind::External,
      path: tokio::fs::canonicalize(root.path())
        .await
        .unwrap()
        .to_string_lossy()
        .into(),
    },
    1,
  ));
  for (query, expected) in [
    ("resume café launch", "Café Plan.md"),
    ("launch cafe resume", "Café Plan.md"),
    ("collab protocol", "collaboration.md"),
    ("colaboration protocol", "collaboration.md"),
    ("abxde", "fuzzy.md"),
    ("全文搜索", "规划路线.md"),
    ("规划 路线", "规划路线.md"),
    ("C++ (alpha:beta)", "cpp.md"),
  ] {
    let result = analysis
      .search(
        workspace.clone(),
        SearchRequest {
          query: query.into(),
          limit: Some(1),
        },
      )
      .await
      .unwrap();
    assert_eq!(result.len(), 1, "{query}");
    assert_eq!(result[0].path, expected, "{query}");
  }
  let index = analysis.index(workspace.clone()).await.unwrap();
  let results = analysis
    .counted_search(
      index.clone(),
      "cafe".into(),
      1,
      Arc::new(AtomicBool::new(false)),
    )
    .await
    .unwrap();
  assert_eq!(results.total_hits, 2);
  assert_eq!(results.results.len(), 1);
  let results = analysis
    .counted_search(
      index.clone(),
      "cafe".into(),
      50,
      Arc::new(AtomicBool::new(false)),
    )
    .await
    .unwrap();
  let hit = results
    .results
    .iter()
    .find(|hit| hit.path == "unicode.md")
    .unwrap();
  assert_eq!((hit.line, hit.column, hit.end_column), (1, 4, 8));
  assert_eq!(
    (
      hit.snippet_highlights[0].start,
      hit.snippet_highlights[0].end
    ),
    (3, 7)
  );
  let error = analysis
    .counted_search(index, "cafe".into(), 1, Arc::new(AtomicBool::new(true)))
    .await
    .err()
    .unwrap();
  assert_eq!(error.code, "MCP_CANCELLED");
  let occurrences = analysis
    .occurrences(
      "test",
      workspace,
      OccurrenceRequest {
        request_id: "literal".into(),
        query: "cafe".into(),
        limit: Some(50),
        options: OccurrenceOptions {
          case_sensitive: false,
          whole_word: false,
          use_regex: false,
        },
      },
    )
    .await
    .unwrap();
  assert_eq!(
    occurrences.total_hits, 0,
    "Literal occurrences must not inherit knowledge-search accent folding"
  );
  database.pool.close().await;
}

#[test]
fn fuzzy_comparison_work_and_queries_are_bounded_without_returning_partial_counts() {
  assert!(search_text::terms(&"x ".repeat(33)).is_err());
  let file = document::parse("safe.md".into(), "# ABCDE\n".into()).unwrap();
  let error = search_text::match_document(
    &file,
    &["abxde".into()],
    &mut super::search_fuzzy::FuzzyBudget::new(0),
    &AtomicBool::new(false),
  )
  .err()
  .unwrap();
  assert_eq!(error.code, "SEARCH_TOO_COMPLEX");
  assert_eq!(
    search_text::fold("Café re\u{301}sume Straße Łódź Æsir Œuvre Þorn"),
    "cafe resume strasse lodz aesir oeuvre thorn"
  );
  let cancelled = search_text::match_document(
    &file,
    &["abcde".into()],
    &mut super::search_fuzzy::FuzzyBudget::new(1000),
    &AtomicBool::new(true),
  );
  assert_eq!(cancelled.err().unwrap().code, "MCP_CANCELLED");
}

#[test]
fn repeated_vocabulary_across_many_documents_does_not_spend_the_fuzzy_budget_again() {
  let mut file = document::parse("notes/repeated.md".into(),
        "# Common vocabulary\ninternationalization interoperability synchronization configuration documentation\n".into()).unwrap();
  let terms = search_text::terms(
    "internationalizaton interoperabilty synchronizaton configuraton documentaton",
  )
  .unwrap();
  let mut budget = super::search_fuzzy::FuzzyBudget::new(8_000_000);
  for document in 0..5000 {
    file.path = format!("notes/document-{document}.md");
    assert!(
      search_text::match_document(&file, &terms, &mut budget, &AtomicBool::new(false))
        .unwrap()
        .is_some()
    );
  }
  assert!(
    budget.remaining > 7_900_000,
    "Only unique term/word comparisons consume the DP budget"
  );
}
