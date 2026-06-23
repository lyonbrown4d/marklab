use std::pin::Pin;
use std::sync::{Arc, Mutex, MutexGuard};

use marklab_knowledge_engine_core::{
  WorkspaceEngine, WorkspaceMarkdownLink, WorkspaceMarkdownSymbol, WorkspaceSearchHighlight,
  WorkspaceSearchResult,
};
use marklab_knowledge_grpc_api::v1::{
  control_service_server::ControlService, document_session_service_server::DocumentSessionService,
  markdown_service_server::MarkdownService, search_service_server::SearchService, sync_request,
  sync_response, DocumentAcknowledged, GetCapabilitiesRequest, GetCapabilitiesResponse,
  GetDocumentSymbolsRequest, GetDocumentSymbolsResponse, GetLinksRequest, GetLinksResponse,
  MarkdownDocumentSymbol, MarkdownLink, Position, Range, SearchHighlight, SearchRequest,
  SearchResponse, SearchResult, ShutdownRequest, ShutdownResponse, StorageCapabilities,
  SyncRequest, SyncResponse,
};
use marklab_knowledge_protocol::{ENGINE_VERSION, PROTOCOL_VERSION};
use tokio::sync::{mpsc, oneshot};
use tokio_stream::{wrappers::ReceiverStream, Stream};
use tonic::{Request, Response, Status};

type SharedEngine = Arc<Mutex<WorkspaceEngine>>;
type SharedShutdown = Arc<Mutex<Option<oneshot::Sender<()>>>>;
type GrpcStream<T> = Pin<Box<dyn Stream<Item = Result<T, Status>> + Send + 'static>>;

const DEFAULT_SEARCH_LIMIT: usize = 20;
const MAX_SEARCH_LIMIT: usize = 100;

#[derive(Clone)]
pub(crate) struct KnowledgeGrpcService {
  engine: SharedEngine,
  workspace_instance_id: Arc<String>,
  shutdown: SharedShutdown,
}

impl KnowledgeGrpcService {
  pub(crate) fn new(
    engine: WorkspaceEngine,
    workspace_instance_id: String,
    shutdown: oneshot::Sender<()>,
  ) -> Self {
    Self {
      engine: Arc::new(Mutex::new(engine)),
      workspace_instance_id: Arc::new(workspace_instance_id),
      shutdown: Arc::new(Mutex::new(Some(shutdown))),
    }
  }

  fn lock_engine(&self) -> Result<MutexGuard<'_, WorkspaceEngine>, Status> {
    self
      .engine
      .lock()
      .map_err(|_| Status::internal("knowledge engine state lock poisoned"))
  }

  fn request_shutdown(&self) -> Result<bool, Status> {
    let Some(sender) = self
      .shutdown
      .lock()
      .map_err(|_| Status::internal("shutdown state lock poisoned"))?
      .take()
    else {
      return Ok(false);
    };

    Ok(sender.send(()).is_ok())
  }
}

#[derive(Clone)]
pub(crate) struct SessionTokenInterceptor {
  token: Arc<String>,
}

impl SessionTokenInterceptor {
  pub(crate) fn new(token: String) -> Self {
    Self {
      token: Arc::new(token),
    }
  }
}

impl tonic::service::Interceptor for SessionTokenInterceptor {
  fn call(&mut self, request: Request<()>) -> Result<Request<()>, Status> {
    let metadata = request.metadata();
    let session_token_matches = metadata
      .get("x-grpc-session-token")
      .and_then(|value| value.to_str().ok())
      .is_some_and(|value| value == self.token.as_str());
    let authorization_matches = metadata
      .get("authorization")
      .and_then(|value| value.to_str().ok())
      .and_then(|value| value.strip_prefix("Bearer "))
      .is_some_and(|value| value == self.token.as_str());

    if session_token_matches || authorization_matches {
      Ok(request)
    } else {
      Err(Status::unauthenticated("invalid gRPC session token"))
    }
  }
}

#[tonic::async_trait]
impl ControlService for KnowledgeGrpcService {
  async fn get_capabilities(
    &self,
    request: Request<GetCapabilitiesRequest>,
  ) -> Result<Response<GetCapabilitiesResponse>, Status> {
    let request = request.into_inner();
    if !request.workspace_instance_id.is_empty()
      && request.workspace_instance_id != *self.workspace_instance_id
    {
      return Err(Status::failed_precondition(
        "workspace instance id does not match this sidecar",
      ));
    }

    Ok(Response::new(GetCapabilitiesResponse {
      protocol_version: PROTOCOL_VERSION.to_string(),
      engine_version: ENGINE_VERSION.to_string(),
      capabilities: vec![
        "control".to_string(),
        "document-session".to_string(),
        "markdown".to_string(),
        "search".to_string(),
      ],
      storage: Some(StorageCapabilities {
        metadata_store: "redb".to_string(),
        search_index: "tantivy".to_string(),
        blob_store: false,
      }),
    }))
  }

  async fn shutdown(
    &self,
    _request: Request<ShutdownRequest>,
  ) -> Result<Response<ShutdownResponse>, Status> {
    Ok(Response::new(ShutdownResponse {
      accepted: self.request_shutdown()?,
    }))
  }
}

#[tonic::async_trait]
impl DocumentSessionService for KnowledgeGrpcService {
  type SyncStream = GrpcStream<SyncResponse>;

  async fn sync(
    &self,
    request: Request<tonic::Streaming<SyncRequest>>,
  ) -> Result<Response<Self::SyncStream>, Status> {
    let mut inbound = request.into_inner();
    let engine = self.engine.clone();
    let (sender, receiver) = mpsc::channel(16);

    tokio::spawn(async move {
      loop {
        let request = match inbound.message().await {
          Ok(Some(request)) => request,
          Ok(None) => break,
          Err(status) => {
            let _ = sender.send(Err(status)).await;
            break;
          }
        };

        if sender
          .send(handle_sync_request(&engine, request))
          .await
          .is_err()
        {
          break;
        }
      }
    });

    Ok(Response::new(
      Box::pin(ReceiverStream::new(receiver)) as Self::SyncStream
    ))
  }
}

#[tonic::async_trait]
impl MarkdownService for KnowledgeGrpcService {
  async fn get_document_symbols(
    &self,
    request: Request<GetDocumentSymbolsRequest>,
  ) -> Result<Response<GetDocumentSymbolsResponse>, Status> {
    let request = request.into_inner();
    let symbols = self
      .lock_engine()?
      .document_symbols(&request.document_id)
      .into_iter()
      .map(markdown_symbol_to_proto)
      .collect();

    Ok(Response::new(GetDocumentSymbolsResponse { symbols }))
  }

  async fn get_links(
    &self,
    request: Request<GetLinksRequest>,
  ) -> Result<Response<GetLinksResponse>, Status> {
    let request = request.into_inner();
    let links = self
      .lock_engine()?
      .links(&request.document_id)
      .into_iter()
      .map(markdown_link_to_proto)
      .collect();

    Ok(Response::new(GetLinksResponse { links }))
  }
}

#[tonic::async_trait]
impl SearchService for KnowledgeGrpcService {
  type SearchStream = GrpcStream<SearchResponse>;

  async fn search(
    &self,
    request: Request<SearchRequest>,
  ) -> Result<Response<Self::SearchStream>, Status> {
    let request = request.into_inner();
    let limit = search_limit(request.limit);
    let results = self
      .lock_engine()?
      .search(&request.query, limit)
      .map_err(|error| Status::internal(format!("workspace search failed: {error}")))?
      .into_iter()
      .map(search_result_to_proto)
      .collect();
    let response = SearchResponse {
      results,
      done: true,
    };

    Ok(Response::new(
      Box::pin(tokio_stream::iter(std::iter::once(Ok(response)))) as Self::SearchStream,
    ))
  }
}

fn handle_sync_request(
  engine: &SharedEngine,
  request: SyncRequest,
) -> Result<SyncResponse, Status> {
  match request.event {
    Some(sync_request::Event::Open(open)) => {
      engine
        .lock()
        .map_err(|_| Status::internal("knowledge engine state lock poisoned"))?
        .open_markdown_document(open.document_id.clone(), open.content, open.version);
      Ok(acknowledged(open.document_id, open.version))
    }
    Some(sync_request::Event::Change(change)) => Ok(resync_required(
      change.document_id,
      "incremental document changes are not implemented",
    )),
    Some(sync_request::Event::Close(close)) => {
      engine
        .lock()
        .map_err(|_| Status::internal("knowledge engine state lock poisoned"))?
        .close_markdown_document(&close.document_id);
      Ok(acknowledged(close.document_id, 0))
    }
    Some(sync_request::Event::Resync(resync)) => {
      engine
        .lock()
        .map_err(|_| Status::internal("knowledge engine state lock poisoned"))?
        .open_markdown_document(resync.document_id.clone(), resync.content, resync.version);
      Ok(acknowledged(resync.document_id, resync.version))
    }
    None => Err(Status::invalid_argument("sync request missing event")),
  }
}

fn acknowledged(document_id: String, version: u64) -> SyncResponse {
  SyncResponse {
    event: Some(sync_response::Event::Acknowledged(DocumentAcknowledged {
      document_id,
      version,
    })),
  }
}

fn resync_required(document_id: String, reason: &str) -> SyncResponse {
  SyncResponse {
    event: Some(sync_response::Event::ResyncRequired(
      marklab_knowledge_grpc_api::v1::ResyncRequired {
        document_id,
        reason: reason.to_string(),
      },
    )),
  }
}

fn markdown_symbol_to_proto(symbol: WorkspaceMarkdownSymbol) -> MarkdownDocumentSymbol {
  MarkdownDocumentSymbol {
    name: symbol.name,
    kind: symbol.kind,
    level: symbol.level,
    slug: symbol.slug,
    range: Some(point_range(symbol.line, symbol.column)),
  }
}

fn markdown_link_to_proto(link: WorkspaceMarkdownLink) -> MarkdownLink {
  MarkdownLink {
    source_document_id: link.source_document_id,
    text: link.text,
    target: link.target,
    range: Some(point_range(link.line, link.column)),
    is_external: link.is_external,
  }
}

fn search_result_to_proto(result: WorkspaceSearchResult) -> SearchResult {
  SearchResult {
    document_id: result.document_id,
    path: result.path,
    title: result.title,
    line: result.line,
    column: result.column,
    end_column: result.end_column,
    snippet: result.snippet,
    snippet_highlights: result
      .snippet_highlights
      .into_iter()
      .map(search_highlight_to_proto)
      .collect(),
    score: result.score,
  }
}

fn search_highlight_to_proto(highlight: WorkspaceSearchHighlight) -> SearchHighlight {
  SearchHighlight {
    start: highlight.start,
    end: highlight.end,
  }
}

fn point_range(line: usize, column: usize) -> Range {
  let line = saturating_u32(line.saturating_sub(1));
  let character = saturating_u32(column.saturating_sub(1));
  let position = Position { line, character };

  Range {
    start: Some(position.clone()),
    end: Some(position),
  }
}

fn search_limit(limit: u32) -> usize {
  if limit == 0 {
    DEFAULT_SEARCH_LIMIT
  } else {
    (limit as usize).min(MAX_SEARCH_LIMIT)
  }
}

fn saturating_u32(value: usize) -> u32 {
  value.min(u32::MAX as usize) as u32
}
