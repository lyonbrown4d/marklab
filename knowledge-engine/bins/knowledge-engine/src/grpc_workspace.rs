use marklab_knowledge_engine_core::{SearchDocument, WorkspaceEngine};
use marklab_knowledge_grpc_api::v1::{
  workspace_service_server::WorkspaceService, CloseWorkspaceRequest, CloseWorkspaceResponse,
  HasDocumentsRequest, HasDocumentsResponse, OpenWorkspaceRequest, OpenWorkspaceResponse,
  RebuildIndexRequest, RebuildIndexResponse, RemoveDocumentRequest, RemoveDocumentResponse,
  RemovePathPrefixRequest, RemovePathPrefixResponse, UpsertDocumentRequest, UpsertDocumentResponse,
  WorkspaceDocument,
};
use tonic::{Request, Response, Status};

use crate::grpc_services::KnowledgeGrpcService;

#[tonic::async_trait]
impl WorkspaceService for KnowledgeGrpcService {
  async fn open_workspace(
    &self,
    request: Request<OpenWorkspaceRequest>,
  ) -> Result<Response<OpenWorkspaceResponse>, Status> {
    let request = request.into_inner();
    let engine = WorkspaceEngine::open(request.index_path)
      .map_err(|error| Status::internal(format!("workspace open failed: {error}")))?;
    let documents = engine
      .document_count()
      .map_err(|error| Status::internal(format!("workspace count failed: {error}")))?;
    *self.lock_engine()? = engine;

    Ok(Response::new(OpenWorkspaceResponse {
      ok: true,
      documents: saturating_u64(documents),
    }))
  }

  async fn close_workspace(
    &self,
    _request: Request<CloseWorkspaceRequest>,
  ) -> Result<Response<CloseWorkspaceResponse>, Status> {
    Ok(Response::new(CloseWorkspaceResponse { ok: true }))
  }

  async fn has_documents(
    &self,
    _request: Request<HasDocumentsRequest>,
  ) -> Result<Response<HasDocumentsResponse>, Status> {
    let has_documents = self
      .lock_engine()?
      .has_documents()
      .map_err(|error| Status::internal(format!("workspace has documents failed: {error}")))?;

    Ok(Response::new(HasDocumentsResponse { has_documents }))
  }

  async fn rebuild_index(
    &self,
    request: Request<RebuildIndexRequest>,
  ) -> Result<Response<RebuildIndexResponse>, Status> {
    let documents = request
      .into_inner()
      .documents
      .into_iter()
      .map(search_document_from_proto)
      .collect::<Vec<_>>();
    let count = self
      .lock_engine()?
      .rebuild(&documents)
      .map_err(|error| Status::internal(format!("workspace rebuild failed: {error}")))?;

    Ok(Response::new(RebuildIndexResponse {
      documents: saturating_u64(count),
    }))
  }

  async fn upsert_document(
    &self,
    request: Request<UpsertDocumentRequest>,
  ) -> Result<Response<UpsertDocumentResponse>, Status> {
    let Some(document) = request.into_inner().document else {
      return Err(Status::invalid_argument("document is required"));
    };
    let count = self
      .lock_engine()?
      .upsert_document(&search_document_from_proto(document))
      .map_err(|error| Status::internal(format!("workspace upsert failed: {error}")))?;

    Ok(Response::new(UpsertDocumentResponse {
      documents: saturating_u64(count),
    }))
  }

  async fn remove_document(
    &self,
    request: Request<RemoveDocumentRequest>,
  ) -> Result<Response<RemoveDocumentResponse>, Status> {
    let count = self
      .lock_engine()?
      .remove_document(&request.into_inner().path)
      .map_err(|error| Status::internal(format!("workspace remove failed: {error}")))?;

    Ok(Response::new(RemoveDocumentResponse {
      documents: saturating_u64(count),
    }))
  }

  async fn remove_path_prefix(
    &self,
    request: Request<RemovePathPrefixRequest>,
  ) -> Result<Response<RemovePathPrefixResponse>, Status> {
    let count = self
      .lock_engine()?
      .remove_path_prefix(&request.into_inner().prefix)
      .map_err(|error| Status::internal(format!("workspace remove prefix failed: {error}")))?;

    Ok(Response::new(RemovePathPrefixResponse {
      documents: saturating_u64(count),
    }))
  }
}

fn search_document_from_proto(document: WorkspaceDocument) -> SearchDocument {
  SearchDocument {
    path: document.path,
    title: document.title,
    content: document.content,
  }
}

fn saturating_u64(value: usize) -> u64 {
  value.min(u64::MAX as usize) as u64
}
