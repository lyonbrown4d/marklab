use super::{complete, fixture};
use serde_json::json;

#[tokio::test]
async fn heading_completions_keep_fuzzy_queries_wiki_scope_and_unsaved_headings() {
  let (_directory, index) = fixture().await;
  for text in [
    "See [Install](target.md#inst guid",
    "See [[target#inst guid",
  ] {
    let value = complete(&index, text, "file:///notes/current.md").await;
    let heading = value["items"]
      .as_array()
      .expect("headings")
      .iter()
      .find(|item| item["label"] == "Installation Guide")
      .expect("abbreviated heading query");
    assert_eq!(heading["insertText"], "installation-guide");
    assert_eq!(heading["detail"], "notes/target.md#installation-guide");
    assert_eq!(
      heading["textEdit"]["range"]["start"]["character"],
      text.find('#').expect("anchor") + 1
    );
    assert_eq!(heading["textEdit"]["range"]["end"]["character"], text.len());
  }
  let current = complete(
    &index,
    "# Current\n## Draft Heading\nSee [Draft](#dra",
    "file:///notes/current.md",
  )
  .await;
  assert_eq!(current["items"][0]["label"], "Draft Heading");
  assert_eq!(current["items"][0]["insertText"], "draft-heading");
  assert_eq!(
    current["items"][0]["detail"],
    "notes/current.md#draft-heading"
  );
  assert_eq!(current["items"][0]["sortText"], "0005-Draft Heading");
  assert_eq!(
    current["items"][0]["textEdit"]["range"],
    json!({"start":{"line":2,"character":13},"end":{"line":2,"character":16}})
  );
}

#[tokio::test]
async fn code_fences_preserve_existing_aliases_languages_and_keyword_replacement() {
  let (_directory, index) = fixture().await;
  for (query, expected) in [
    ("js", "javascript"),
    ("ts", "typescript"),
    ("md", "markdown"),
    ("mmd", "mermaid"),
    ("yml", "yaml"),
    ("sh", "bash"),
  ] {
    let value = complete(&index, &format!("```{query}"), "file:///notes/current.md").await;
    assert!(
      value["items"]
        .as_array()
        .expect("aliases")
        .iter()
        .any(|item| item["label"] == expected)
    );
  }
  let all = complete(&index, "```", "file:///notes/current.md").await;
  assert_eq!(
    all["items"].as_array().expect("original languages").len(),
    14
  );
  let keyword = complete(&index, "😀 ```JS", "file:///notes/current.md").await;
  assert_eq!(keyword["items"][0]["label"], "javascript");
  assert_eq!(
    keyword["items"][0]["textEdit"],
    json!({"newText":"javascript","range":{"start":{"line":0,"character":6},"end":{"line":0,"character":8}}})
  );
  let included = complete(&index, "```script", "file:///notes/current.md").await;
  assert_eq!(
    included["items"]
      .as_array()
      .expect("substring language search")
      .iter()
      .map(|item| item["label"].as_str().expect("label"))
      .collect::<Vec<_>>(),
    ["javascript", "typescript"]
  );
  for text in ["inline```js", "```js trailing", "```pyt"] {
    assert_eq!(
      complete(&index, text, "file:///notes/current.md").await["items"],
      json!([])
    );
  }
}
