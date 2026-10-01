import { z } from 'zod'

import { getElectronRuntime } from '@/runtime/electron'
import { invoke } from '@/runtime/ipc'
import {
  backgroundTaskStatusSchema,
  fsAssetBytesSchema,
  fsAssetCapabilitySchema,
  fsBufferStatusSchema,
  fsGraphSchema,
  fsLinkPreviewMetadataSchema,
  fsMarkdownAssetImportResultSchema,
  fsMarkdownAssetResolveResultSchema,
  fsMarkdownDiagnosticSchema,
  fsPathMetadataSchema,
  fsRootInfoSchema,
  fsSearchResultSchema,
  fsSnapshotSchema,
  fsWorkspaceIndexSchema,
  opaqueAssetUrlSchema,
  workspaceRelativeAssetPathSchema,
  type MarkdownAssetImportStrategy,
} from '@/services/fsApiSchemas'

export * from '@/services/fsApiSchemas'

export const fsApi = {
  async getSnapshot() {
    const result = await invoke<unknown>('fs_get_snapshot')
    return fsSnapshotSchema.parse(result)
  },
  async setRoot(path: string | null) {
    const result = await invoke<unknown>('fs_set_root', { path })
    return fsRootInfoSchema.parse(result)
  },
  async setSingleFile(path: string) {
    const result = await invoke<unknown>('fs_set_single_file', { path })
    return fsRootInfoSchema.parse(result)
  },
  openFile(path: string) {
    return invoke<string>('fs_open_file', { path })
  },
  readFile(path: string) {
    return invoke<string>('fs_read_file', { path })
  },
  async getWorkspaceIndex() {
    const result = await invoke<unknown>('fs_get_workspace_index')
    return fsWorkspaceIndexSchema.parse(result)
  },
  async getWorkspaceGraph() {
    const result = await invoke<unknown>('fs_get_workspace_graph')
    return fsGraphSchema.parse(result)
  },
  async getOutlineGraph(path: string) {
    const result = await invoke<unknown>('fs_get_outline_graph', { path })
    return fsGraphSchema.parse(result)
  },
  async analyzeMarkdownBuffer(path: string, content: string) {
    const result = await invoke<unknown>('fs_analyze_markdown_buffer', { path, content })
    return z.array(fsMarkdownDiagnosticSchema).parse(result)
  },
  async searchWorkspace(query: string, limit = 20) {
    const result = await invoke<unknown>('fs_search_workspace', { query, limit })
    return z.array(fsSearchResultSchema).parse(result)
  },
  rebuildSearchIndex() {
    return invoke<void>('fs_rebuild_search_index')
  },
  async updateBuffer(path: string, content: string) {
    const result = await invoke<unknown>('fs_update_buffer', { path, content })
    return fsBufferStatusSchema.parse(result)
  },
  flushBuffers() {
    return invoke<number>('fs_flush_buffers')
  },
  async getBufferStatus(path: string) {
    const result = await invoke<unknown>('fs_get_buffer_status', { path })
    return result == null ? null : fsBufferStatusSchema.parse(result)
  },
  async getBackgroundTasks() {
    const result = await invoke<unknown>('fs_get_background_tasks')
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
    const result = await invoke<unknown>('fs_get_path_metadata', { path })
    return fsPathMetadataSchema.parse(result)
  },
  async toAssetUrl(relativePath: string) {
    const path = workspaceRelativeAssetPathSchema.parse(relativePath)
    const result = await getElectronRuntime().assets.issueCapability({ path })
    const capability = fsAssetCapabilitySchema.parse(result)
    if (capability.expires_at_ms <= Date.now()) {
      throw new Error('Issued asset capability has already expired')
    }
    return capability
  },
  async readAssetBytes(assetUrl: string) {
    const asset_url = opaqueAssetUrlSchema.parse(assetUrl)
    const result = await getElectronRuntime().assets.readBytes({ asset_url })
    return fsAssetBytesSchema.parse(result)
  },
  openPathInSystem(path: string) {
    return getElectronRuntime().workspace.openPathInSystem(path)
  },
  revealPathInSystem(path: string) {
    return getElectronRuntime().workspace.revealPathInSystem(path)
  },
  copyAbsolutePathToClipboard(path: string) {
    return getElectronRuntime().workspace.copyAbsolutePathToClipboard(path)
  },
  async importMarkdownAsset({
    sourcePath,
    documentPath,
    strategy,
    title,
  }: {
    sourcePath: string
    documentPath: string
    strategy: MarkdownAssetImportStrategy
    title?: string | null
  }) {
    const result = await invoke<unknown>('fs_import_markdown_asset', {
      sourcePath,
      documentPath,
      strategy,
      title,
    })
    return fsMarkdownAssetImportResultSchema.parse(result)
  },
  async importMarkdownAssetBase64({
    fileName,
    base64Data,
    documentPath,
    title,
  }: {
    fileName: string
    base64Data: string
    documentPath: string
    title?: string | null
  }) {
    const result = await invoke<unknown>('fs_import_markdown_asset_base64', {
      fileName,
      base64Data,
      documentPath,
      title,
    })
    return fsMarkdownAssetImportResultSchema.parse(result)
  },
  async resolveMarkdownAsset({ documentPath, target }: { documentPath: string; target: string }) {
    const result = await invoke<unknown>('fs_resolve_markdown_asset', {
      documentPath,
      target,
    })
    return fsMarkdownAssetResolveResultSchema.parse(result)
  },
  async fetchLinkPreview(url: string) {
    const result = await invoke<unknown>('fs_fetch_link_preview', { url })
    return fsLinkPreviewMetadataSchema.parse(result)
  },
}
