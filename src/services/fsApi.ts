import type { DesktopCommandArgs } from '@/generated/desktop/bindings'
import type { RuntimeCommandPayload } from '@/runtime/tauri/contract'
import { z } from 'zod'

import { getDesktopRuntime } from '@/runtime/desktop'
import { invoke } from '@/runtime/ipc'
import { parseWorkspaceGraphNodeDetails } from '@/services/fsGraphCompatibility'
import {
  backgroundTaskStatusSchema,
  fsAssetCapabilitySchema,
  fsBufferSyncStatusSchema,
  fsBufferSnapshotSchema,
  fsBufferUpdateRequestSchema,
  fsBufferUpdateResultSchema,
  fsGraphSchema,
  fsMarkdownAssetImportResultSchema,
  fsMarkdownAssetResolveResultSchema,
  fsPathMetadataSchema,
  fsRootInfoSchema,
  fsSearchResultSchema,
  fsSnapshotSchema,
  fsTextPreviewLimitSchema,
  fsTextPreviewSchema,
  workspaceRelativeAssetPathSchema,
  workspaceOccurrenceSearchRequestSchema,
  workspaceOccurrenceSearchResultSetSchema,
  workspaceOccurrenceSearchCancelResultSchema,
  workspaceGraphNodeDetailsRequestSchema,
  type WorkspaceOccurrenceSearchRequest,
  type FsBufferUpdateRequest,
  type FsBufferSyncStatus,
  type FsGraph,
  type FsSearchResult,
  type WorkspaceOccurrenceSearchResultSet,
  type WorkspaceGraphNodeDetailsRequest,
  type MarkdownAssetImportStrategy,
} from '@/services/fsApiSchemas'

export * from '@/services/fsApiSchemas'

export const fsApi = {
  async getSnapshot() {
    const result = await invoke('fs_get_snapshot')
    return fsSnapshotSchema.parse(result)
  },
  async setRoot(path: string | null) {
    const result = await invoke('fs_set_root', { path })
    return fsRootInfoSchema.parse(result)
  },
  async setSingleFile(path: string) {
    const result = await invoke('fs_set_single_file', { path })
    return fsRootInfoSchema.parse(result)
  },
  openFile(path: string) {
    return invoke('fs_open_file', { path })
  },
  async openBufferSnapshot(path: string) {
    return fsBufferSnapshotSchema.parse(await invoke('fs_open_buffer_snapshot', { path }))
  },
  readFile(path: string) {
    return invoke('fs_read_file', { path })
  },
  async readTextPreview(path: string, limitBytes: number) {
    const limit = fsTextPreviewLimitSchema.parse(limitBytes)
    const result = await getDesktopRuntime().workspace.readTextPreview(path, limit)
    return fsTextPreviewSchema.parse(result)
  },
  async getWorkspaceGraph(): Promise<FsGraph> {
    const result = await invoke('fs_get_workspace_graph')
    return fsGraphSchema.parse(result)
  },
  async getWorkspaceGraphNodeDetails(request: WorkspaceGraphNodeDetailsRequest) {
    const payload = workspaceGraphNodeDetailsRequestSchema.parse(request)
    const result = await invoke('fs_get_workspace_graph_node_details', payload)
    return parseWorkspaceGraphNodeDetails(result)
  },
  async searchWorkspace(query: string, limit = 20): Promise<FsSearchResult[]> {
    const result = await invoke('fs_search_workspace', { query, limit })
    return z.array(fsSearchResultSchema).parse(result)
  },
  async searchWorkspaceOccurrences(
    request: WorkspaceOccurrenceSearchRequest,
  ): Promise<WorkspaceOccurrenceSearchResultSet> {
    const payload = workspaceOccurrenceSearchRequestSchema.parse(request)
    const result = await invoke('fs_search_workspace_occurrences', payload)
    return workspaceOccurrenceSearchResultSetSchema.parse(result)
  },
  async cancelWorkspaceOccurrenceSearch(requestId: string) {
    const result = await invoke('fs_cancel_workspace_occurrence_search', { requestId })
    return workspaceOccurrenceSearchCancelResultSchema.parse(result)
  },
  rebuildSearchIndex() {
    return invoke('fs_rebuild_search_index')
  },
  async applyBufferUpdate(request: FsBufferUpdateRequest) {
    const payload = fsBufferUpdateRequestSchema.parse(request)
    const result = await invoke('fs_apply_buffer_update', payload)
    return fsBufferUpdateResultSchema.parse(result)
  },
  async updateBuffer(path: string, content: string, loadedStatus: FsBufferSyncStatus) {
    const status = fsBufferSyncStatusSchema.parse(loadedStatus)
    if (status.path !== path)
      throw new Error('Loaded buffer status belongs to a different document')
    const result = await this.applyBufferUpdate({
      path,
      base_revision: status.revision,
      session_generation: status.session_generation,
      update: { kind: 'snapshot', content },
    })
    if (result.kind === 'session_mismatch')
      throw new Error('Workspace changed before the buffer update was applied')
    if (result.kind === 'resync_required')
      throw new Error(
        'Document changed in another editor. Reload before saving; your unsaved text is retained.',
      )
    return fsBufferSyncStatusSchema.parse({
      path: result.path,
      revision: result.revision,
      dirty: result.dirty,
      session_generation: result.session_generation,
    })
  },
  flushBuffers() {
    return invoke('fs_flush_buffers')
  },
  async getBufferStatus(path: string) {
    const result = await invoke('fs_get_buffer_status', { path })
    return result == null ? null : fsBufferSyncStatusSchema.parse(result)
  },
  async getBackgroundTasks() {
    const result = await invoke('fs_get_background_tasks')
    return z.array(backgroundTaskStatusSchema).parse(result)
  },
  createFile(path: string, content?: string) {
    return invoke('fs_create_file', { path, content })
  },
  createDir(path: string) {
    return invoke('fs_create_dir', { path })
  },
  renamePath(from: string, to: string) {
    return invoke('fs_rename_path', { from, to })
  },
  movePath(from: string, to: string) {
    return invoke('fs_move_path', { from, to })
  },
  deletePath(path: string) {
    return invoke('fs_delete_path', { path })
  },
  async getPathMetadata(path: string) {
    const result = await invoke('fs_get_path_metadata', { path })
    return fsPathMetadataSchema.parse(result)
  },
  async toAssetUrl(relativePath: string) {
    const path = workspaceRelativeAssetPathSchema.parse(relativePath)
    const result = await getDesktopRuntime().assets.issueCapability({ path })
    const capability = fsAssetCapabilitySchema.parse(result)
    if (capability.expires_at_ms <= Date.now()) {
      throw new Error('Issued asset capability has already expired')
    }
    return capability
  },
  openPathInSystem(path: string) {
    return getDesktopRuntime().workspace.openPathInSystem(path)
  },
  revealPathInSystem(path: string) {
    return getDesktopRuntime().workspace.revealPathInSystem(path)
  },
  copyAbsolutePathToClipboard(path: string) {
    return getDesktopRuntime().workspace.copyAbsolutePathToClipboard(path)
  },
  async importMarkdownAsset({
    sourcePath,
    documentPath,
    strategy,
    title,
  }: Omit<DesktopCommandArgs['fs_import_markdown_asset']['request'], 'strategy'> & {
    strategy: MarkdownAssetImportStrategy
  }) {
    const result = await invoke('fs_import_markdown_asset', {
      sourcePath,
      documentPath,
      strategy,
      title,
    })
    return fsMarkdownAssetImportResultSchema.parse(result)
  },
  async importMarkdownAssetBytes({
    fileName,
    bytes,
    documentPath,
    title,
  }: RuntimeCommandPayload<'fs_import_markdown_asset_bytes'>) {
    const result = await invoke('fs_import_markdown_asset_bytes', {
      fileName,
      bytes,
      documentPath,
      title,
    })
    return fsMarkdownAssetImportResultSchema.parse(result)
  },
  async resolveMarkdownAsset({
    documentPath,
    target,
  }: DesktopCommandArgs['fs_resolve_markdown_asset']['request']) {
    const result = await invoke('fs_resolve_markdown_asset', {
      documentPath,
      target,
    })
    return fsMarkdownAssetResolveResultSchema.parse(result)
  },
}
