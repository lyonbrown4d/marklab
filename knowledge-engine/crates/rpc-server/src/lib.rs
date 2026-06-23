use std::io::{self, BufRead, Write};

use marklab_knowledge_engine_core::KnowledgeEngine;
use marklab_knowledge_protocol::{error_response, parse_json_rpc_request};

pub fn run_stdio() -> io::Result<()> {
  let stdin = io::stdin();
  let mut stdout = io::stdout();
  let mut engine = KnowledgeEngine::new();
  tracing::info!("knowledge engine stdio server started");

  for line in stdin.lock().lines() {
    let line = line?;
    let response = handle_line(&mut engine, &line);
    writeln!(stdout, "{response}")?;
    stdout.flush()?;

    if engine.shutdown_requested() {
      tracing::info!("knowledge engine shutdown requested");
      break;
    }
  }

  tracing::info!("knowledge engine stdio server stopped");
  Ok(())
}

pub fn handle_line(engine: &mut KnowledgeEngine, line: &str) -> String {
  match parse_json_rpc_request(line) {
    Ok(request) => engine.handle_request(&request),
    Err(_) => error_response(None, -32700, "Parse error"),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn handles_initialize_line() {
    let mut engine = KnowledgeEngine::new();
    let response = handle_line(
      &mut engine,
      r#"{"jsonrpc":"2.0","id":1,"method":"initialize"}"#,
    );

    assert!(response.contains(r#""id":1"#));
    assert!(response.contains(r#""capabilities""#));
  }

  #[test]
  fn handles_invalid_line() {
    let mut engine = KnowledgeEngine::new();
    let response = handle_line(&mut engine, "not-json");

    assert!(response.contains(r#""code":-32700"#));
  }
}
