use std::pin::Pin;
use std::sync::{Arc, Mutex, MutexGuard};

use marklab_knowledge_engine_core::{
  WorkspaceDocumentChange, WorkspaceDocumentEdit, WorkspaceDocumentPosition,
  WorkspaceDocumentRange, WorkspaceEngine,
};
use marklab_knowledge_grpc_api::v1::{
  control_service_server::ControlService, document_session_service_server::DocumentSessionService,
  sync_request, sync_response, DocumentAcknowledged, GetCapabilitiesRequest,
  GetCapabilitiesResponse, ShutdownRequest, ShutdownResponse, StorageCapabilities, SyncRequest,
  SyncResponse, TextEdit,
};
use tokio::sync::{mpsc, oneshot};
use tokio_stream::{wrappers::ReceiverStream, Stream};
use tonic::{Request, Response, Status};

pub(crate) type SharedEngine = Arc<Mutex<WorkspaceEngine>>;
type SharedShutdown = Arc<Mutex<Option<oneshot::Sender<()>>>>;
pub(crate) type GrpcStream<T> = Pin<Box<dyn Stream<Item = Result<T, Status>> + Send + 'static>>;

const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
const PROTOCOL_VERSION: &str = "0.1";

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

  pub(crate) fn lock_engine(&self) -> Result<MutexGuard<'_, WorkspaceEngine>, Status> {
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
      .get("x-marklab-session-token")
      .and_then(|value| value.to_str().ok())
      .is_some_and(|value| value == self.token.as_str());

    if session_token_matches {
      Ok(request)
    } else {
      Err(Status::unauthenticated("unauthenticated"))
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
    let workspace_instance_id = self.workspace_instance_id.clone();
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
          .send(handle_sync_request(
            &engine,
            workspace_instance_id.as_str(),
            request,
          ))
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

fn handle_sync_request(
  engine: &SharedEngine,
  workspace_instance_id: &str,
  request: SyncRequest,
) -> Result<SyncResponse, Status> {
  if request.workspace_instance_id != workspace_instance_id {
    return Err(Status::failed_precondition(
      "workspace instance id does not match this sidecar",
    ));
  }

  match request.event {
    Some(sync_request::Event::Open(open)) => {
      engine
        .lock()
        .map_err(|_| Status::internal("knowledge engine state lock poisoned"))?
        .open_markdown_document(open.document_id.clone(), open.content, open.version);
      Ok(acknowledged(open.document_id, open.version))
    }
    Some(sync_request::Event::Change(change)) => {
      let document_id = change.document_id.clone();
      let version = change.version;
      match engine
        .lock()
        .map_err(|_| Status::internal("knowledge engine state lock poisoned"))?
        .change_markdown_document(workspace_change_from_proto(change))
      {
        Ok(()) => Ok(acknowledged(document_id, version)),
        Err(error) => Ok(resync_required(document_id, &error)),
      }
    }
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

fn workspace_change_from_proto(
  change: marklab_knowledge_grpc_api::v1::ApplyDocumentChange,
) -> WorkspaceDocumentChange {
  WorkspaceDocumentChange {
    document_id: change.document_id,
    base_version: change.base_version,
    version: change.version,
    edits: change
      .changes
      .into_iter()
      .filter_map(workspace_edit_from_proto)
      .collect(),
  }
}

fn workspace_edit_from_proto(edit: TextEdit) -> Option<WorkspaceDocumentEdit> {
  let range = edit.range?;
  let start = range.start?;
  let end = range.end?;
  Some(WorkspaceDocumentEdit {
    range: WorkspaceDocumentRange {
      start: WorkspaceDocumentPosition {
        line: start.line as usize,
        character: start.character as usize,
      },
      end: WorkspaceDocumentPosition {
        line: end.line as usize,
        character: end.character as usize,
      },
    },
    text: edit.text,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use tonic::metadata::MetadataValue;
  use tonic::service::Interceptor;

  #[test]
  fn interceptor_accepts_marklab_session_token_metadata() {
    let mut interceptor = SessionTokenInterceptor::new("secret".to_string());
    let mut request = Request::new(());
    request.metadata_mut().insert(
      "x-marklab-session-token",
      MetadataValue::try_from("secret").expect("metadata value should be valid"),
    );

    assert!(interceptor.call(request).is_ok());
  }

  #[test]
  fn interceptor_rejects_missing_session_token() {
    let mut interceptor = SessionTokenInterceptor::new("secret".to_string());

    let status = interceptor
      .call(Request::new(()))
      .expect_err("missing token should be rejected");

    assert_eq!(status.code(), tonic::Code::Unauthenticated);
    assert_eq!(status.message(), "unauthenticated");
  }

  #[test]
  fn interceptor_rejects_authorization_fallback() {
    let mut interceptor = SessionTokenInterceptor::new("secret".to_string());
    let mut request = Request::new(());
    request.metadata_mut().insert(
      "authorization",
      MetadataValue::try_from("Bearer secret").expect("metadata value should be valid"),
    );

    assert_eq!(
      interceptor
        .call(request)
        .expect_err("authorization fallback should be rejected")
        .code(),
      tonic::Code::Unauthenticated
    );
  }
}
