use marklab_knowledge_grpc_api::v1::{
  workspace_vfs_service_server::WorkspaceVfsService, CreateWorkspaceDirectoryRequest,
  CreateWorkspaceFileRequest, DeleteWorkspacePathRequest, GetWorkspaceFileSnapshotRequest,
  GetWorkspaceFileSnapshotResponse, GetWorkspacePathMetadataRequest,
  GetWorkspacePathMetadataResponse, ListWorkspaceEntriesRequest, ListWorkspaceEntriesResponse,
  ReadWorkspaceFileRequest, ReadWorkspaceFileResponse, RenameWorkspacePathRequest,
  WorkspaceFileEntry, WorkspaceFileEntryKind, WorkspacePathMutationResponse,
};
use marklab_knowledge_workspace_vfs::{VfsEntry, VfsEntryKind, VfsError, VfsMetadata, VfsMutation};
use tonic::{Request, Response, Status};

use crate::grpc_services::KnowledgeGrpcService;

#[tonic::async_trait]
impl WorkspaceVfsService for KnowledgeGrpcService {
  async fn get_snapshot(
    &self,
    _request: Request<GetWorkspaceFileSnapshotRequest>,
  ) -> Result<Response<GetWorkspaceFileSnapshotResponse>, Status> {
    let snapshot = self.vfs().snapshot().await.map_err(status_from_vfs_error)?;

    Ok(Response::new(GetWorkspaceFileSnapshotResponse {
      entries: snapshot.entries.into_iter().map(entry_to_proto).collect(),
    }))
  }

  async fn list_entries(
    &self,
    _request: Request<ListWorkspaceEntriesRequest>,
  ) -> Result<Response<ListWorkspaceEntriesResponse>, Status> {
    let snapshot = self.vfs().snapshot().await.map_err(status_from_vfs_error)?;

    Ok(Response::new(ListWorkspaceEntriesResponse {
      entries: snapshot.entries.into_iter().map(entry_to_proto).collect(),
    }))
  }

  async fn read_file(
    &self,
    request: Request<ReadWorkspaceFileRequest>,
  ) -> Result<Response<ReadWorkspaceFileResponse>, Status> {
    let content = self
      .vfs()
      .read_file(&request.into_inner().path)
      .await
      .map_err(status_from_vfs_error)?;

    Ok(Response::new(ReadWorkspaceFileResponse { content }))
  }

  async fn create_file(
    &self,
    request: Request<CreateWorkspaceFileRequest>,
  ) -> Result<Response<WorkspacePathMutationResponse>, Status> {
    let mutation = self
      .vfs()
      .create_file(&request.into_inner().path)
      .await
      .map_err(status_from_vfs_error)?;

    Ok(Response::new(mutation_to_proto(mutation)))
  }

  async fn create_directory(
    &self,
    request: Request<CreateWorkspaceDirectoryRequest>,
  ) -> Result<Response<WorkspacePathMutationResponse>, Status> {
    let mutation = self
      .vfs()
      .create_dir(&request.into_inner().path)
      .await
      .map_err(status_from_vfs_error)?;

    Ok(Response::new(mutation_to_proto(mutation)))
  }

  async fn rename_path(
    &self,
    request: Request<RenameWorkspacePathRequest>,
  ) -> Result<Response<WorkspacePathMutationResponse>, Status> {
    let request = request.into_inner();
    let mutation = self
      .vfs()
      .rename_path(&request.from, &request.to)
      .await
      .map_err(status_from_vfs_error)?;

    Ok(Response::new(mutation_to_proto(mutation)))
  }

  async fn delete_path(
    &self,
    request: Request<DeleteWorkspacePathRequest>,
  ) -> Result<Response<WorkspacePathMutationResponse>, Status> {
    let mutation = self
      .vfs()
      .delete_path(&request.into_inner().path)
      .await
      .map_err(status_from_vfs_error)?;

    Ok(Response::new(mutation_to_proto(mutation)))
  }

  async fn get_path_metadata(
    &self,
    request: Request<GetWorkspacePathMetadataRequest>,
  ) -> Result<Response<GetWorkspacePathMetadataResponse>, Status> {
    let metadata = self
      .vfs()
      .metadata(&request.into_inner().path)
      .await
      .map_err(status_from_vfs_error)?;

    Ok(Response::new(metadata_to_proto(metadata)))
  }
}

fn entry_to_proto(entry: VfsEntry) -> WorkspaceFileEntry {
  WorkspaceFileEntry {
    path: entry.path,
    name: entry.name,
    kind: entry_kind_to_proto(entry.kind) as i32,
  }
}

fn metadata_to_proto(metadata: VfsMetadata) -> GetWorkspacePathMetadataResponse {
  GetWorkspacePathMetadataResponse {
    path: metadata.path,
    absolute_path: metadata.absolute_path,
    kind: entry_kind_to_proto(metadata.kind) as i32,
    size_bytes: metadata.size_bytes,
    modified_ms: metadata.modified_ms,
    readonly: metadata.readonly,
  }
}

fn mutation_to_proto(mutation: VfsMutation) -> WorkspacePathMutationResponse {
  WorkspacePathMutationResponse {
    ok: true,
    kind: entry_kind_to_proto(mutation.kind) as i32,
    changed: mutation.changed,
  }
}

fn entry_kind_to_proto(kind: VfsEntryKind) -> WorkspaceFileEntryKind {
  match kind {
    VfsEntryKind::File => WorkspaceFileEntryKind::File,
    VfsEntryKind::Folder => WorkspaceFileEntryKind::Folder,
  }
}

fn status_from_vfs_error(error: VfsError) -> Status {
  match error {
    VfsError::EmptyPath
    | VfsError::InvalidCharacters
    | VfsError::AbsolutePath
    | VfsError::ParentPath
    | VfsError::EscapesWorkspace => Status::invalid_argument(error.to_string()),
    VfsError::NotFile => Status::failed_precondition(error.to_string()),
    VfsError::RootUnavailable { .. } | VfsError::RootNotDirectory { .. } => {
      Status::failed_precondition(error.to_string())
    }
    VfsError::Path { .. }
    | VfsError::Metadata { .. }
    | VfsError::ReadFile { .. }
    | VfsError::CreatePath { .. }
    | VfsError::RenamePath { .. }
    | VfsError::DeletePath { .. }
    | VfsError::Walk { .. }
    | VfsError::TaskJoin { .. } => Status::internal(error.to_string()),
  }
}
