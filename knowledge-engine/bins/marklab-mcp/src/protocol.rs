use std::io::{self, BufRead, Write};

use serde_json::{json, Value};

use crate::context_tools::{
  ContextToolError, McpContextTools, ToolOutput, TOOL_SEARCH_WORKSPACE, TOOL_WORKSPACE_STATUS,
};

const MCP_PROTOCOL_VERSION: &str = "2025-06-18";
const JSONRPC_VERSION: &str = "2.0";

const PARSE_ERROR: i32 = -32700;
const INVALID_REQUEST: i32 = -32600;
const METHOD_NOT_FOUND: i32 = -32601;
const INVALID_PARAMS: i32 = -32602;
const INTERNAL_ERROR: i32 = -32603;

pub(crate) fn serve(
  tools: McpContextTools,
  reader: impl BufRead,
  mut writer: impl Write,
) -> io::Result<()> {
  for line in reader.lines() {
    let line = line?;
    if line.trim().is_empty() {
      continue;
    }

    let response = match serde_json::from_str::<Value>(&line) {
      Ok(message) => handle_message(&tools, message),
      Err(error) => Some(error_response(
        Value::Null,
        PARSE_ERROR,
        format!("Invalid JSON-RPC message: {error}"),
      )),
    };

    if let Some(response) = response {
      write_message(&mut writer, &response)?;
    }
  }

  Ok(())
}

fn handle_message(tools: &McpContextTools, message: Value) -> Option<Value> {
  let id = message.get("id").cloned();
  if message.get("jsonrpc").and_then(Value::as_str) != Some(JSONRPC_VERSION) {
    return id.map(|id| error_response(id, INVALID_REQUEST, "Invalid JSON-RPC version"));
  }

  let method = match message.get("method").and_then(Value::as_str) {
    Some(method) => method,
    None => return id.map(|id| error_response(id, INVALID_REQUEST, "Missing method")),
  };

  let Some(id) = id else {
    return handle_notification(method);
  };

  match method {
    "initialize" => Some(success_response(id, initialize_result())),
    "ping" => Some(success_response(id, json!({}))),
    "tools/list" => Some(success_response(id, tools_list_result())),
    "tools/call" => Some(call_tool_response(tools, id, message.get("params"))),
    _ => Some(error_response(
      id,
      METHOD_NOT_FOUND,
      format!("Unknown MCP method: {method}"),
    )),
  }
}

fn handle_notification(method: &str) -> Option<Value> {
  match method {
    "notifications/initialized" => None,
    "notifications/cancelled" => None,
    _ => None,
  }
}

fn initialize_result() -> Value {
  json!({
    "protocolVersion": MCP_PROTOCOL_VERSION,
    "capabilities": {
      "tools": {
        "listChanged": false,
      }
    },
    "serverInfo": {
      "name": "marklab-mcp",
      "title": "MarkLab MCP Sidecar",
      "version": env!("CARGO_PKG_VERSION"),
    },
    "instructions": "Read-only MarkLab workspace context. Tools expose indexed workspace status and search results; they do not write files or execute commands."
  })
}

fn tools_list_result() -> Value {
  json!({
    "tools": [
      {
        "name": TOOL_WORKSPACE_STATUS,
        "title": "MarkLab workspace status",
        "description": "Return health, index, and storage status for the active MarkLab knowledge index.",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "additionalProperties": false,
        },
        "annotations": {
          "readOnlyHint": true,
          "destructiveHint": false,
          "openWorldHint": false,
        }
      },
      {
        "name": TOOL_SEARCH_WORKSPACE,
        "title": "Search MarkLab workspace",
        "description": "Search the active MarkLab knowledge index and return bounded Markdown document matches.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Search query text."
            },
            "limit": {
              "type": "integer",
              "minimum": 1,
              "maximum": 50,
              "description": "Maximum number of matches to return. Defaults to the sidecar default."
            }
          },
          "required": ["query"],
          "additionalProperties": false,
        },
        "annotations": {
          "readOnlyHint": true,
          "destructiveHint": false,
          "openWorldHint": false,
        }
      }
    ]
  })
}

fn call_tool_response(tools: &McpContextTools, id: Value, params: Option<&Value>) -> Value {
  let Some(Value::Object(params)) = params else {
    return error_response(id, INVALID_PARAMS, "tools/call params must be an object");
  };
  let Some(Value::String(name)) = params.get("name") else {
    return error_response(
      id,
      INVALID_PARAMS,
      "tools/call params.name must be a string",
    );
  };
  let arguments = match params.get("arguments") {
    Some(Value::Object(_)) => params.get("arguments"),
    Some(_) => {
      return error_response(
        id,
        INVALID_PARAMS,
        "tools/call params.arguments must be an object",
      )
    }
    None => None,
  };

  match tools.call_tool(name, arguments) {
    Ok(output) => match tool_success_result(output) {
      Ok(result) => success_response(id, result),
      Err(error) => error_response(id, INTERNAL_ERROR, error),
    },
    Err(error) if error.is_unknown_tool() => error_response(id, INVALID_PARAMS, error.to_string()),
    Err(error) => success_response(id, tool_error_result(error)),
  }
}

fn tool_success_result(output: ToolOutput) -> Result<Value, String> {
  let text = serde_json::to_string_pretty(&output.structured_content)
    .map_err(|error| format!("Failed to serialize tool output: {error}"))?;

  Ok(json!({
    "content": [
      {
        "type": "text",
        "text": text,
      }
    ],
    "structuredContent": output.structured_content,
    "isError": false,
  }))
}

fn tool_error_result(error: ContextToolError) -> Value {
  json!({
    "content": [
      {
        "type": "text",
        "text": error.to_string(),
      }
    ],
    "isError": true,
  })
}

fn success_response(id: Value, result: Value) -> Value {
  json!({
    "jsonrpc": JSONRPC_VERSION,
    "id": id,
    "result": result,
  })
}

fn error_response(id: Value, code: i32, message: impl Into<String>) -> Value {
  json!({
    "jsonrpc": JSONRPC_VERSION,
    "id": id,
    "error": {
      "code": code,
      "message": message.into(),
    }
  })
}

fn write_message(writer: &mut impl Write, message: &Value) -> io::Result<()> {
  serde_json::to_writer(&mut *writer, message).map_err(io::Error::other)?;
  writeln!(writer)?;
  writer.flush()
}

#[cfg(test)]
mod tests {
  use std::fs;
  use std::path::PathBuf;
  use std::time::{SystemTime, UNIX_EPOCH};

  use marklab_knowledge_engine_core::{SearchDocument, WorkspaceEngine};

  use crate::context_tools::McpContextConfig;

  use super::*;

  #[test]
  fn initialize_advertises_tools_capability() {
    let tools = test_tools("initialize");
    let response = handle_message(
      &tools,
      json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
          "protocolVersion": MCP_PROTOCOL_VERSION,
          "capabilities": {},
          "clientInfo": {
            "name": "test-client",
            "version": "0.0.0"
          }
        }
      }),
    )
    .expect("initialize should return a response");

    assert_eq!(response["result"]["protocolVersion"], MCP_PROTOCOL_VERSION);
    assert_eq!(
      response["result"]["capabilities"]["tools"]["listChanged"],
      false
    );
  }

  #[test]
  fn lists_read_only_marklab_tools() {
    let tools = test_tools("tools-list");
    let response = handle_message(
      &tools,
      json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/list"
      }),
    )
    .expect("tools/list should return a response");

    let tools = response["result"]["tools"].as_array().expect("tools list");
    assert_eq!(tools.len(), 2);
    assert_eq!(tools[0]["name"], TOOL_WORKSPACE_STATUS);
    assert_eq!(tools[1]["name"], TOOL_SEARCH_WORKSPACE);
    assert_eq!(tools[1]["annotations"]["readOnlyHint"], true);
  }

  #[test]
  fn calls_search_tool_with_structured_content() {
    let tools = test_tools("tools-call");
    let response = handle_message(
      &tools,
      json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/call",
        "params": {
          "name": TOOL_SEARCH_WORKSPACE,
          "arguments": {
            "query": "alpha",
            "limit": 10
          }
        }
      }),
    )
    .expect("tools/call should return a response");

    assert_eq!(response["result"]["isError"], false);
    assert_eq!(response["result"]["structuredContent"]["resultCount"], 1);
    assert_eq!(
      response["result"]["structuredContent"]["results"][0]["path"],
      "notes/project.md"
    );
  }

  fn test_tools(label: &str) -> McpContextTools {
    let engine = WorkspaceEngine::open(unique_test_path(label)).expect("engine should open");
    engine
      .rebuild(&[SearchDocument {
        path: "notes/project.md".to_string(),
        title: "Project".to_string(),
        content: "alpha context lives here".to_string(),
      }])
      .expect("index should rebuild");

    McpContextTools::from_engine(
      McpContextConfig::new(
        PathBuf::from("/workspace"),
        PathBuf::from("/engine-data"),
        10,
      ),
      engine,
    )
  }

  fn unique_test_path(label: &str) -> String {
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_nanos())
      .unwrap_or_default();
    let path = std::env::temp_dir().join(format!("marklab-mcp-protocol-{label}-{nanos}"));
    let _ = fs::remove_dir_all(&path);
    path.to_string_lossy().to_string()
  }
}
