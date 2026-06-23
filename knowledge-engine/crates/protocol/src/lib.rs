use serde::Deserialize;
use serde_json::{json, Value};

pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const PROTOCOL_VERSION: &str = "0.1";

#[derive(Debug, Clone, PartialEq)]
pub struct JsonRpcRequest {
  pub id: Option<Value>,
  pub method: String,
  pub params: Option<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProtocolError {
  EmptyInput,
  InvalidJson,
  MissingMethod,
}

#[derive(Debug, Deserialize)]
struct RawJsonRpcRequest {
  id: Option<Value>,
  method: Option<String>,
  params: Option<Value>,
}

pub fn parse_json_rpc_request(input: &str) -> Result<JsonRpcRequest, ProtocolError> {
  if input.trim().is_empty() {
    return Err(ProtocolError::EmptyInput);
  }

  let raw: RawJsonRpcRequest =
    serde_json::from_str(input).map_err(|_| ProtocolError::InvalidJson)?;
  let method = raw.method.ok_or(ProtocolError::MissingMethod)?;

  Ok(JsonRpcRequest {
    id: raw.id,
    method,
    params: raw.params,
  })
}

pub fn success_response(id: Option<&Value>, result: Value) -> String {
  serialize_json(json!({
      "jsonrpc": "2.0",
      "id": id.cloned().unwrap_or(Value::Null),
      "result": result,
  }))
}

pub fn error_response(id: Option<&Value>, code: i32, message: &str) -> String {
  serialize_json(json!({
      "jsonrpc": "2.0",
      "id": id.cloned().unwrap_or(Value::Null),
      "error": {
          "code": code,
          "message": message,
      },
  }))
}

fn serialize_json(value: Value) -> String {
  match serde_json::to_string(&value) {
    Ok(serialized) => serialized,
    Err(_) => {
      "{\"jsonrpc\":\"2.0\",\"id\":null,\"error\":{\"code\":-32603,\"message\":\"Internal error\"}}"
        .to_string()
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_string_id_method_and_params() {
    let parsed = parse_json_rpc_request(
      r#"{"jsonrpc":"2.0","id":"a-1","method":"initialize","params":{"x":1}}"#,
    );

    assert_eq!(
      parsed,
      Ok(JsonRpcRequest {
        id: Some(Value::String("a-1".to_string())),
        method: "initialize".to_string(),
        params: Some(json!({ "x": 1 }))
      })
    );
  }

  #[test]
  fn parses_numeric_id() {
    let parsed = parse_json_rpc_request(r#"{"jsonrpc":"2.0","id":7,"method":"knowledge/health"}"#);

    assert_eq!(
      parsed,
      Ok(JsonRpcRequest {
        id: Some(json!(7)),
        method: "knowledge/health".to_string(),
        params: None
      })
    );
  }

  #[test]
  fn reports_missing_method() {
    let parsed = parse_json_rpc_request(r#"{"jsonrpc":"2.0","id":1}"#);

    assert_eq!(parsed, Err(ProtocolError::MissingMethod));
  }

  #[test]
  fn escapes_response_messages() {
    let response = error_response(Some(&json!(1)), -32601, "Unknown \"method\"");

    assert!(response.contains(r#""message":"Unknown \"method\"""#));
  }
}
