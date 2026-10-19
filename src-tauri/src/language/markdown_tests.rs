use super::{MarkdownRequest, reference_diagnostics, symbols};
use serde_json::json;

#[test]
fn outline_selects_heading_text_after_markers_and_preserves_nested_utf16_ranges() {
  let symbols = symbols(&MarkdownRequest {
    path: Some("note.md".into()),
    content: "# Project\n\n## 😀Details\n\n### Task\n\nSetext\n------\n".into(),
    line: 1,
    column: 1,
    new_name: None,
  })
  .unwrap();
  assert_eq!(symbols[0]["column"], 3);
  assert_eq!(symbols[0]["endColumn"], 10);
  let detail = &symbols[0]["children"][0];
  assert_eq!(detail["column"], 4);
  assert_eq!(detail["endColumn"], 13);
  assert_eq!(detail["children"][0]["name"], "Task");
  assert_eq!(symbols[0]["children"][1]["column"], 1);
  assert_eq!(symbols[0]["children"][1]["endColumn"], 7);
}

#[test]
fn references_report_missing_unused_and_all_duplicate_declarations() {
  let diagnostics = reference_diagnostics::compute(
    "[Missing][no-such-ref]\n\n[unused]: https://example.com\n[dup]: https://a.test\n[dup]: https://b.test\n",
  );
  let messages: Vec<_> = diagnostics
    .iter()
    .map(|value| value["message"].as_str().unwrap())
    .collect();
  assert!(messages.contains(&"No link definition found: 'no-such-ref'"));
  assert_eq!(
    messages
      .iter()
      .filter(|message| **message == "Link definition is unused")
      .count(),
    3
  );
  assert_eq!(
    messages
      .iter()
      .filter(|message| **message == "Link definition for 'dup' already exists")
      .count(),
    2
  );
  assert_eq!(
    diagnostics[0]["range"],
    json!({"start":{"line":0,"character":10},"end":{"line":0,"character":21}})
  );
  let used = reference_diagnostics::compute("[A][x]\n\n[x]: a\n[X]: b");
  assert_eq!(used.len(), 2);
  assert!(used.iter().all(|value| {
    value["message"]
      .as_str()
      .unwrap()
      .contains("already exists")
  }));
}

#[test]
fn reference_diagnostics_ignore_code_html_wiki_and_task_syntax_and_accept_valid_images() {
  let text = "```md\n[Missing][fenced]\n[dup]: a\n[dup]: b\n```\n\n`[inline][code]`\n\n<div>\n[html][missing]\n[dup]: c\n</div>\n\n- [x] Done\n\nSee [[Wiki Note#Heading]].\n\n![Alt][image]\n\n[image]: pic.png";
  assert!(reference_diagnostics::compute(text).is_empty());
}

#[test]
fn reference_diagnostics_keep_utf16_crlf_ranges_and_isolate_documents() {
  let diagnostics = reference_diagnostics::compute("😀中文 [标签][缺失]\r\n下一行");
  assert_eq!(diagnostics.len(), 1);
  assert_eq!(
    diagnostics[0]["range"],
    json!({"start":{"line":0,"character":10},"end":{"line":0,"character":12}})
  );
  assert!(reference_diagnostics::compute("[A][x]\n\n[x]: valid").is_empty());
  assert_eq!(
    reference_diagnostics::compute("[A][x]")[0]["message"],
    "No link definition found: 'x'"
  );
}
