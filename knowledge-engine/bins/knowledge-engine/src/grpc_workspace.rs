use marklab_knowledge_engine_core::{
  MarkdownGraphBlock, MarkdownGraphBlockKind, SearchDocument, WorkspaceEngine, WorkspaceGraph,
  WorkspaceGraphDocument, WorkspaceGraphEdge, WorkspaceGraphEdgeKind, WorkspaceGraphKnownPaths,
  WorkspaceGraphMode, WorkspaceGraphNode, WorkspaceGraphNodeKind, WorkspaceStatusSnapshot,
};
use marklab_knowledge_grpc_api::v1::{
  workspace_service_server::WorkspaceService, BuildOutlineGraphRequest, BuildWorkspaceGraphRequest,
  CloseWorkspaceRequest, CloseWorkspaceResponse, GetWorkspaceStatusRequest,
  GetWorkspaceStatusResponse, HasDocumentsRequest, HasDocumentsResponse, OpenWorkspaceRequest,
  OpenWorkspaceResponse, RebuildIndexRequest, RebuildIndexResponse, RemoveDocumentRequest,
  RemoveDocumentResponse, RemovePathPrefixRequest, RemovePathPrefixResponse, UpsertDocumentRequest,
  UpsertDocumentResponse, WorkspaceDocument, WorkspaceGraph as ProtoWorkspaceGraph,
  WorkspaceGraphBlock as ProtoWorkspaceGraphBlock,
  WorkspaceGraphBlockKind as ProtoWorkspaceGraphBlockKind,
  WorkspaceGraphEdge as ProtoWorkspaceGraphEdge,
  WorkspaceGraphEdgeKind as ProtoWorkspaceGraphEdgeKind,
  WorkspaceGraphMode as ProtoWorkspaceGraphMode, WorkspaceGraphNode as ProtoWorkspaceGraphNode,
  WorkspaceGraphNodeKind as ProtoWorkspaceGraphNodeKind, WorkspaceHealthStatus,
  WorkspaceIndexStatus, WorkspaceKnownPaths, WorkspaceStorageStats,
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

  async fn get_workspace_status(
    &self,
    _request: Request<GetWorkspaceStatusRequest>,
  ) -> Result<Response<GetWorkspaceStatusResponse>, Status> {
    let status = self
      .lock_engine()?
      .workspace_status()
      .map_err(|error| Status::internal(format!("workspace status failed: {error}")))?;

    Ok(Response::new(workspace_status_to_proto(status)))
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

  async fn build_workspace_graph(
    &self,
    request: Request<BuildWorkspaceGraphRequest>,
  ) -> Result<Response<ProtoWorkspaceGraph>, Status> {
    let request = request.into_inner();
    let documents = request
      .documents
      .into_iter()
      .map(graph_document_from_proto)
      .collect::<Vec<_>>();
    let graph = self
      .lock_engine()?
      .workspace_graph(&documents, known_paths_from_proto(request.known_paths));

    Ok(Response::new(graph_to_proto(graph)))
  }

  async fn build_outline_graph(
    &self,
    request: Request<BuildOutlineGraphRequest>,
  ) -> Result<Response<ProtoWorkspaceGraph>, Status> {
    let request = request.into_inner();
    let graph = self
      .lock_engine()?
      .outline_graph(&request.path, &request.content);

    Ok(Response::new(graph_to_proto(graph)))
  }
}

fn workspace_status_to_proto(status: WorkspaceStatusSnapshot) -> GetWorkspaceStatusResponse {
  GetWorkspaceStatusResponse {
    health: Some(WorkspaceHealthStatus {
      ok: status.health.ok,
      state: status.health.state,
      metadata_documents: saturating_u64(status.health.metadata_documents),
      searchable_documents: saturating_u64(status.health.searchable_documents),
      pending_outbox_events: saturating_u64(status.health.pending_outbox_events),
      warnings: status.health.warnings,
    }),
    index: Some(WorkspaceIndexStatus {
      search_index: status.index.search_index,
      ready: status.index.ready,
      metadata_documents: saturating_u64(status.index.metadata_documents),
      searchable_documents: saturating_u64(status.index.searchable_documents),
      pending_outbox_events: saturating_u64(status.index.pending_outbox_events),
    }),
    storage: Some(WorkspaceStorageStats {
      metadata_store: status.storage.metadata_store,
      search_index: status.storage.search_index,
      metadata_bytes: status.storage.metadata_bytes,
      search_index_bytes: status.storage.search_index_bytes,
      total_bytes: status.storage.total_bytes,
      metadata_documents: saturating_u64(status.storage.metadata_documents),
      pending_outbox_events: saturating_u64(status.storage.pending_outbox_events),
      blob_store: status.storage.blob_store,
      blob_bytes: status.storage.blob_bytes,
    }),
  }
}

fn search_document_from_proto(document: WorkspaceDocument) -> SearchDocument {
  SearchDocument {
    path: document.path,
    title: document.title,
    content: document.content,
  }
}

fn graph_document_from_proto(document: WorkspaceDocument) -> WorkspaceGraphDocument {
  WorkspaceGraphDocument {
    path: document.path,
    title: document.title,
    content: document.content,
  }
}

fn known_paths_from_proto(known_paths: Option<WorkspaceKnownPaths>) -> WorkspaceGraphKnownPaths {
  let Some(known_paths) = known_paths else {
    return WorkspaceGraphKnownPaths::default();
  };
  WorkspaceGraphKnownPaths {
    paths: known_paths.paths,
    asset_paths: known_paths.asset_paths,
  }
}

fn graph_to_proto(graph: WorkspaceGraph) -> ProtoWorkspaceGraph {
  ProtoWorkspaceGraph {
    mode: graph_mode_to_proto(graph.mode) as i32,
    nodes: graph.nodes.into_iter().map(graph_node_to_proto).collect(),
    edges: graph.edges.into_iter().map(graph_edge_to_proto).collect(),
  }
}

fn graph_node_to_proto(node: WorkspaceGraphNode) -> ProtoWorkspaceGraphNode {
  ProtoWorkspaceGraphNode {
    id: node.id,
    kind: graph_node_kind_to_proto(node.kind) as i32,
    label: node.label,
    path: node.path,
    line: node.line.map(saturating_u32),
    level: node.level,
    slug: node.slug,
    content: node.content,
    content_blocks: node
      .content_blocks
      .into_iter()
      .map(graph_block_to_proto)
      .collect(),
    content_start_line: node.content_start_line.map(saturating_u32),
    content_end_line: node.content_end_line.map(saturating_u32),
  }
}

fn graph_edge_to_proto(edge: WorkspaceGraphEdge) -> ProtoWorkspaceGraphEdge {
  ProtoWorkspaceGraphEdge {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    kind: graph_edge_kind_to_proto(edge.kind) as i32,
  }
}

fn graph_block_to_proto(block: MarkdownGraphBlock) -> ProtoWorkspaceGraphBlock {
  ProtoWorkspaceGraphBlock {
    id: block.id,
    kind: graph_block_kind_to_proto(block.kind) as i32,
    text: block.text,
    level: block.level,
    language: block.language,
    ordered: block.ordered,
    items: block.items,
  }
}

fn graph_mode_to_proto(mode: WorkspaceGraphMode) -> ProtoWorkspaceGraphMode {
  match mode {
    WorkspaceGraphMode::Mindmap => ProtoWorkspaceGraphMode::Mindmap,
    WorkspaceGraphMode::Outline => ProtoWorkspaceGraphMode::Outline,
  }
}

fn graph_node_kind_to_proto(kind: WorkspaceGraphNodeKind) -> ProtoWorkspaceGraphNodeKind {
  match kind {
    WorkspaceGraphNodeKind::File => ProtoWorkspaceGraphNodeKind::File,
    WorkspaceGraphNodeKind::Heading => ProtoWorkspaceGraphNodeKind::Heading,
    WorkspaceGraphNodeKind::Missing => ProtoWorkspaceGraphNodeKind::Missing,
    WorkspaceGraphNodeKind::External => ProtoWorkspaceGraphNodeKind::External,
  }
}

fn graph_edge_kind_to_proto(kind: WorkspaceGraphEdgeKind) -> ProtoWorkspaceGraphEdgeKind {
  match kind {
    WorkspaceGraphEdgeKind::Contains => ProtoWorkspaceGraphEdgeKind::Contains,
    WorkspaceGraphEdgeKind::LinksTo => ProtoWorkspaceGraphEdgeKind::LinksTo,
    WorkspaceGraphEdgeKind::ReferencesHeading => ProtoWorkspaceGraphEdgeKind::ReferencesHeading,
  }
}

fn graph_block_kind_to_proto(kind: MarkdownGraphBlockKind) -> ProtoWorkspaceGraphBlockKind {
  match kind {
    MarkdownGraphBlockKind::Paragraph => ProtoWorkspaceGraphBlockKind::Paragraph,
    MarkdownGraphBlockKind::Blockquote => ProtoWorkspaceGraphBlockKind::Blockquote,
    MarkdownGraphBlockKind::Code => ProtoWorkspaceGraphBlockKind::Code,
    MarkdownGraphBlockKind::List => ProtoWorkspaceGraphBlockKind::List,
    MarkdownGraphBlockKind::Divider => ProtoWorkspaceGraphBlockKind::Divider,
    MarkdownGraphBlockKind::Table => ProtoWorkspaceGraphBlockKind::Table,
  }
}

fn saturating_u64(value: usize) -> u64 {
  value.min(u64::MAX as usize) as u64
}

fn saturating_u32(value: usize) -> u32 {
  value.min(u32::MAX as usize) as u32
}
