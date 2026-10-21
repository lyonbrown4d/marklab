use super::*;
use crate::language::{mermaid, types::Position};
use serde_json::json;

#[test]
fn standard_protocol_serialization_keeps_optional_fields_and_matches_reflection_shapes() {
  let completion = mermaid::completion(
    "sequenceDiagram\n  ",
    Position {
      line: 1,
      character: 2,
    },
  )
  .unwrap();
  let wire = serde_json::to_value(&completion).unwrap();
  let reflected: CompletionListShape = serde_json::from_value(wire.clone()).unwrap();
  assert_eq!(reflected.items.len(), completion.0.items.len());
  let participant = wire["items"]
    .as_array()
    .unwrap()
    .iter()
    .find(|item| item["label"] == "participant")
    .unwrap();
  assert!(participant.get("insertText").is_none());
  assert_eq!(participant["insertTextFormat"], 2);
  assert_eq!(
    participant["textEdit"]["range"],
    json!({
      "start": { "line": 1, "character": 2 }, "end": { "line": 1, "character": 2 }
    })
  );
  let diagnostics = DiagnosticsResponse(mermaid::diagnostics("flowchart TD\n  A --> [", 4));
  let wire = serde_json::to_value(diagnostics).unwrap();
  let reflected: Vec<DiagnosticShape> = serde_json::from_value(wire.clone()).unwrap();
  assert!(!reflected.is_empty());
  assert_eq!(wire[0]["severity"], 1);
  assert_eq!(wire[0]["source"], "mermaid");
  assert_eq!(wire[0]["range"]["start"]["line"], 4);
  assert!(wire[0].get("code").is_none());
}
