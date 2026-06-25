import type { FsEntry, FsPathMetadata, FsSnapshot } from '@electron/services/workspace/types.js'
import type { WorkspaceVfsClient } from '@electron/services/knowledgeEngine/grpcWire.js'
import type { KnowledgeWorkspacePathMutation } from '@electron/services/knowledgeEngine/knowledgeEngineTypes.js'
import { invokeUnary } from '@electron/services/knowledgeEngine/grpcClientRuntime.js'
import {
  workspaceFileEntryKindToFsKind,
  workspaceFileEntryToFsEntry,
} from '@electron/services/knowledgeEngine/knowledgeFileMapping.js'

export const getWorkspaceFileSnapshot = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  root: FsSnapshot['root'],
): Promise<FsSnapshot> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.getSnapshot, {})
  return { root, entries: response.entries.map(workspaceFileEntryToFsEntry) }
}

export const listWorkspaceEntries = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
): Promise<FsEntry[]> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.listEntries, {})
  return response.entries.map(workspaceFileEntryToFsEntry)
}

export const readWorkspaceFile = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  path: string,
): Promise<string> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.readFile, { path })
  return response.content
}

export const createWorkspaceFile = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  path: string,
): Promise<KnowledgeWorkspacePathMutation> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.createFile, { path })
  return { kind: workspaceFileEntryKindToFsKind(response.kind), changed: response.changed }
}

export const createWorkspaceDirectory = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  path: string,
): Promise<KnowledgeWorkspacePathMutation> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.createDirectory, {
    path,
  })
  return { kind: workspaceFileEntryKindToFsKind(response.kind), changed: response.changed }
}

export const renameWorkspacePath = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  from: string,
  to: string,
): Promise<KnowledgeWorkspacePathMutation> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.renamePath, {
    from,
    to,
  })
  return { kind: workspaceFileEntryKindToFsKind(response.kind), changed: response.changed }
}

export const deleteWorkspacePath = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  path: string,
): Promise<KnowledgeWorkspacePathMutation> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.deletePath, { path })
  return { kind: workspaceFileEntryKindToFsKind(response.kind), changed: response.changed }
}

export const getWorkspacePathMetadata = async (
  sessionToken: string,
  workspaceVfs: WorkspaceVfsClient,
  path: string,
): Promise<FsPathMetadata> => {
  const response = await invokeUnary(sessionToken, workspaceVfs, workspaceVfs.getPathMetadata, {
    path,
  })
  return {
    absolute_path: response.absolutePath,
    kind: workspaceFileEntryKindToFsKind(response.kind),
    modified_ms: response.modifiedMs,
    path: response.path,
    readonly: response.readonly,
    size_bytes: Number(response.sizeBytes),
  }
}
