use super::{adapter::Adapter, types::*};
use rmcp::{
    ErrorData, RoleServer, ServerHandler,
    model::{
        CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation,
        ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
        ToolAnnotations,
    },
    schemars::{JsonSchema, schema_for},
    service::RequestContext,
};
use serde_json::{Map, Value, json};
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};

pub(super) const STATUS: &str = "marklab_workspace_status";
pub(super) const SEARCH: &str = "marklab_search_workspace";

pub(super) struct Server {
    pub adapter: Arc<Adapter>,
    tools: Vec<Tool>,
}

impl Server {
    pub fn new(adapter: Arc<Adapter>) -> Self {
        Self {
            adapter,
            tools: vec![
                definition::<Empty, Status>(
                    STATUS,
                    "MarkLab workspace status",
                    "Return health, index, and storage status for the configured workspace index. Storage bytes are scoped logical payload sizes, excluding SQLite page overhead.",
                ),
                definition::<SearchInput, SearchOutput>(
                    SEARCH,
                    "Search MarkLab workspace",
                    "Search the configured workspace index and return bounded Markdown matches.",
                ),
            ],
        }
    }
}

impl ServerHandler for Server {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("marklab-mcp", "0.2.0").with_title("MarkLab MCP Sidecar"))
            .with_instructions("Read-only MarkLab workspace context. Tools expose indexed status and search results; they never modify source documents or execute commands. Only the explicitly configured engine cache directory is written.")
    }

    fn get_tool(&self, name: &str) -> Option<Tool> {
        self.tools.iter().find(|tool| tool.name == name).cloned()
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        Ok(ListToolsResult {
            tools: self.tools.clone(),
            ..Default::default()
        })
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let arguments = Value::Object(request.arguments.unwrap_or_default());
        let cancelled = CancelFlag(Arc::new(AtomicBool::new(false)));
        let operation = async {
            match request.name.as_ref() {
                STATUS => {
                    serde_json::from_value::<Empty>(arguments).map_err(|_| bad_arguments())?;
                    Ok(tool_result(self.adapter.status().await))
                }
                SEARCH => {
                    let input = serde_json::from_value::<SearchInput>(arguments)
                        .map_err(|_| bad_arguments())?;
                    if input.query.trim().is_empty()
                        || input.query.len() > 1024
                        || input.limit.is_some_and(|limit| !(1..=50).contains(&limit))
                    {
                        return Err(bad_arguments());
                    }
                    Ok(tool_result(
                        self.adapter.search(input, cancelled.0.clone()).await,
                    ))
                }
                _ => Err(ErrorData::invalid_params("Unknown MarkLab MCP tool", None)),
            }
        };
        tokio::select! {
            biased;
            _ = context.ct.cancelled() => Ok(CallToolResult::error(vec![ContentBlock::text("MCP_CANCELLED: Request cancelled")]).into()),
            result = operation => result.map(Into::into),
        }
    }
}

fn bad_arguments() -> ErrorData {
    ErrorData::invalid_params(
        "Invalid tool arguments. Status accepts {}; search requires query (1–1024 bytes) and optional integer limit (1–50). Workspace paths cannot be overridden.",
        None,
    )
}

fn definition<I: JsonSchema, O: JsonSchema>(
    name: &'static str,
    title: &str,
    description: &'static str,
) -> Tool {
    Tool::new(name, description, schema::<I>())
        .with_title(title)
        .with_raw_output_schema(Arc::new(schema::<O>()))
        .with_annotations(
            ToolAnnotations::new()
                .read_only(true)
                .destructive(false)
                .idempotent(true)
                .open_world(false),
        )
}

fn schema<T: JsonSchema>() -> Map<String, Value> {
    schema_for!(T).ensure_object().clone()
}

fn tool_result<T: serde::Serialize>(result: crate::error::BackendResult<T>) -> CallToolResult {
    match result {
        Ok(value) => match serde_json::to_value(value) {
            Ok(value) => CallToolResult::structured(value),
            Err(_) => CallToolResult::error(vec![ContentBlock::text(
                "MCP_RESULT_FAILED: Could not encode tool result",
            )]),
        },
        Err(error) => {
            let message = match error.code.as_str() {
                "INDEX_TOO_LARGE" => "Workspace Markdown exceeds the 128 MiB indexing limit",
                "MCP_CANCELLED" => "Request cancelled",
                "SEARCH_TOO_COMPLEX" => {
                    "Search comparison budget exceeded; use shorter or more specific terms"
                }
                _ => "Cannot read workspace or engine cache; check directory access and retry",
            };
            CallToolResult::structured_error(json!({"code":"MCP_TOOL_FAILED","message":message}))
        }
    }
}

struct CancelFlag(Arc<AtomicBool>);
impl Drop for CancelFlag {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}
