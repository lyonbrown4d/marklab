use super::{
  adapter::Adapter,
  config::Config,
  server::{SEARCH, STATUS, Server},
};
use rmcp::{
  RoleClient, ServiceExt,
  model::{CallToolRequest, CallToolRequestParams, ClientRequest},
  service::{PeerRequestOptions, RunningService},
};
use serde_json::{Value, json};
use std::{ffi::OsString, sync::Arc, time::Duration};

fn parse(args: &[&str], vars: &[(&str, &str)]) -> crate::error::BackendResult<Config> {
  Config::parse(args.iter().map(OsString::from), |name| {
    vars
      .iter()
      .find(|(key, _)| *key == name)
      .map(|(_, value)| OsString::from(value))
  })
}

#[test]
fn config_preserves_explicit_priority_and_rejects_ambiguous_or_unbounded_options() {
  let config = parse(
    &[
      "--workspace-root=.",
      "--engine-data-dir",
      "..",
      "--default-search-limit=3",
    ],
    &[
      ("MARKLAB_MCP_DEFAULT_SEARCH_LIMIT", "invalid"),
      ("MARKLAB_MCP_WORKSPACE_ROOT", "ignored"),
    ],
  )
  .unwrap();
  assert!(config.workspace_root.is_absolute());
  assert_eq!(config.default_search_limit, 3);
  let env = [
    ("MARKLAB_MCP_WORKSPACE_ROOT", "."),
    ("MARKLAB_MCP_ENGINE_DATA_DIR", ".."),
  ];
  assert_eq!(parse(&[], &env).unwrap().default_search_limit, 10);
  for args in [
    vec!["--unknown=x"],
    vec!["--workspace-root"],
    vec!["--workspace-root=.", "--workspace-root=.."],
    vec!["--default-search-limit=0"],
    vec!["--default-search-limit=51"],
    vec!["--default-search-limit=2.5"],
    vec!["--engine-data-dir="],
  ] {
    assert!(parse(&args, &env).is_err(), "{args:?}");
  }
  assert!(parse(&[], &[]).is_err());
}

async fn adapter(root: &std::path::Path, cache: &std::path::Path) -> Arc<Adapter> {
  Arc::new(
    Adapter::open(Config {
      workspace_root: root.into(),
      engine_data_dir: cache.into(),
      default_search_limit: 2,
    })
    .await
    .unwrap(),
  )
}

async fn connect(
  adapter: Arc<Adapter>,
) -> (RunningService<RoleClient, ()>, tokio::task::JoinHandle<()>) {
  let (server_io, client_io) = tokio::io::duplex(65536);
  let server = tokio::spawn(async move {
    Server::new(adapter)
      .serve(server_io)
      .await
      .unwrap()
      .waiting()
      .await
      .unwrap();
  });
  let client = ().serve(client_io).await.unwrap();
  (client, server)
}

async fn call(client: &RunningService<RoleClient, ()>, name: &'static str, args: Value) -> Value {
  let result = client
    .call_tool(CallToolRequestParams::new(name).with_arguments(args.as_object().unwrap().clone()))
    .await
    .unwrap();
  assert_ne!(result.is_error, Some(true), "{result:?}");
  let value = result.structured_content.unwrap();
  assert_eq!(
    serde_json::from_str::<Value>(&result.content[0].as_text().unwrap().text).unwrap(),
    value
  );
  value
}

#[tokio::test]
async fn official_sdk_handshake_tools_counts_freshness_and_single_workspace_isolation() {
  tokio::time::timeout(Duration::from_secs(40), async {
    let temp = tempfile::tempdir().unwrap();
    let first = temp.path().join("first");
    let second = temp.path().join("second");
    tokio::fs::create_dir_all(&first).await.unwrap();
    tokio::fs::create_dir_all(&second).await.unwrap();
    for file in ["a.md", "b.md", "c.md"] {
      tokio::fs::write(first.join(file), "# Shared\nneedle 😀 original\n")
        .await
        .unwrap();
    }
    tokio::fs::write(second.join("other.md"), "# Foreign\nneedle secret\n")
      .await
      .unwrap();
    // Explicit nested engine directories are compatible; cache Markdown is excluded.
    let cache = first.join("engine");
    tokio::fs::create_dir_all(cache.join("tauri-storage"))
      .await
      .unwrap();
    tokio::fs::write(cache.join("tauri-storage/hidden.md"), "needle cache secret")
      .await
      .unwrap();
    let a = adapter(&first, &cache).await;
    let b = adapter(&second, &cache).await;
    let (client, server) = connect(a.clone()).await;
    let tools = client.list_all_tools().await.unwrap();
    assert_eq!(tools.len(), 2);
    assert!(
      tools
        .iter()
        .all(|tool| tool.annotations.as_ref().unwrap().read_only_hint == Some(true))
    );
    assert_eq!(
      client
        .peer_info()
        .unwrap()
        .server_info
        .as_ref()
        .unwrap()
        .name,
      "marklab-mcp"
    );
    let result = call(&client, SEARCH, json!({"query":"needle","limit":1})).await;
    assert_eq!(result["totalHits"], 3);
    assert_eq!(result["resultCount"], 1);
    assert_eq!(
      result["results"][0]["documentId"],
      result["results"][0]["path"]
    );
    assert_eq!(result["results"][0]["line"], 2);
    assert_eq!(result["results"][0]["endColumn"], 7);
    let foreign = b
      .search(
        super::types::SearchInput {
          query: "needle".into(),
          limit: None,
        },
        Arc::new(std::sync::atomic::AtomicBool::new(false)),
      )
      .await
      .unwrap();
    assert_eq!(foreign.total_hits, 1);
    assert_eq!(foreign.results[0].path, "other.md");
    let status = call(&client, STATUS, json!({})).await;
    assert_eq!(status["health"]["searchableDocuments"], "3");
    assert_eq!(status["storage"]["metadataDocuments"], "3");
    assert!(
      status["storage"]["totalBytes"]
        .as_str()
        .unwrap()
        .parse::<u64>()
        .unwrap()
        > 0
    );
    assert!(
      status["health"]["warnings"][0]
        .as_str()
        .unwrap()
        .contains("logical")
    );
    assert_eq!(
      call(&client, SEARCH, json!({"query":"missing"})).await["totalHits"],
      0
    );
    tokio::fs::write(first.join("a.md"), "# Changed\nreplacement\n")
      .await
      .unwrap();
    assert_eq!(
      call(&client, SEARCH, json!({"query":"needle"})).await["totalHits"],
      2
    );
    assert_eq!(
      tokio::fs::read_to_string(first.join("b.md")).await.unwrap(),
      "# Shared\nneedle 😀 original\n"
    );
    client.cancel().await.unwrap();
    server.await.unwrap();
    a.close().await;
    b.close().await;
  })
  .await
  .unwrap();
}

#[tokio::test]
async fn sdk_rejects_invalid_arguments_and_cancellation_releases_queued_read() {
  tokio::time::timeout(Duration::from_secs(40), async {
    let root = tempfile::tempdir().unwrap();
    let cache = tempfile::tempdir().unwrap();
    let adapter = adapter(root.path(), cache.path()).await;
    let (client, server) = connect(adapter.clone()).await;
    for args in [
      json!({"query":""}),
      json!({"query":"x","limit":0}),
      json!({"query":"x","limit":51}),
      json!({"query":"x","limit":1.5}),
      json!({"query":"x","limit":null}),
      json!({"query":"x","workspaceRoot":"/elsewhere"}),
    ] {
      assert!(
        client
          .call_tool(
            CallToolRequestParams::new(SEARCH).with_arguments(args.as_object().unwrap().clone())
          )
          .await
          .is_err()
      );
    }
    let guard = adapter.workspace.mutation.lock().await;
    let request = client
      .send_cancellable_request(
        ClientRequest::CallToolRequest(CallToolRequest::new(CallToolRequestParams::new(STATUS))),
        PeerRequestOptions::no_options(),
      )
      .await
      .unwrap();
    // The request owns the adapter operation lock, but cannot begin a read.
    while adapter.operation.try_lock().is_ok() {
      tokio::task::yield_now().await;
    }
    request
      .cancel(Some("test cancellation".into()))
      .await
      .unwrap();
    let released = adapter.operation.lock().await;
    drop(released);
    drop(guard);
    assert_eq!(
      call(&client, STATUS, json!({})).await["health"]["searchableDocuments"],
      "0"
    );
    client.cancel().await.unwrap();
    server.await.unwrap();
    adapter.close().await;
  })
  .await
  .unwrap();
}
