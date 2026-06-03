import { invoke } from '@/runtime/ipc'
import { z } from 'zod'

export const fsRootInfoSchema = z.object({
  kind: z.enum(['internal', 'external', 'single']),
  path: z.string(),
})

export const fsEntrySchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'folder']),
  name: z.string().optional(),
})

export const fsSnapshotSchema = z.object({
  root: fsRootInfoSchema,
  entries: z.array(fsEntrySchema),
})

export const fsPathMetadataSchema = z.object({
  path: z.string(),
  absolute_path: z.string(),
  kind: z.enum(['file', 'folder']),
  size_bytes: z.number(),
  modified_ms: z.number().optional(),
  readonly: z.boolean(),
})

export const fsBufferStatusSchema = z.object({
  path: z.string(),
  revision: z.number(),
  dirty: z.boolean(),
})

export const backgroundTaskStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['idle', 'running', 'error']),
  message: z.string().nullable().optional(),
})

export const fsMarkdownHeadingSchema = z.object({
  path: z.string(),
  level: z.number(),
  text: z.string(),
  slug: z.string(),
  line: z.number(),
})

export const fsMarkdownLinkSchema = z.object({
  source_path: z.string(),
  text: z.string(),
  target: z.string(),
  link_type: z.enum(['markdown', 'wiki']),
  target_path: z.string().nullable().optional(),
  target_anchor: z.string().nullable().optional(),
  target_heading_slug: z.string().nullable().optional(),
  is_external: z.boolean(),
  context: z.string(),
  line: z.number(),
  column: z.number(),
})

export const fsMarkdownAssetSchema = z.object({
  source_path: z.string(),
  target: z.string(),
  target_path: z.string().nullable().optional(),
  is_external: z.boolean(),
  media_type: z.string().nullable().optional(),
  context: z.string(),
  line: z.number(),
  column: z.number(),
})

export const fsIndexedMarkdownFileSchema = z.object({
  path: z.string(),
  headings: z.array(fsMarkdownHeadingSchema),
  links: z.array(fsMarkdownLinkSchema),
  assets: z.array(fsMarkdownAssetSchema).default([]),
})

export const fsWorkspaceIndexSchema = z.object({
  files: z.array(fsIndexedMarkdownFileSchema),
})

export const fsMarkdownDiagnosticSchema = z.object({
  line: z.number(),
  start_column: z.number(),
  end_column: z.number(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
})

export const fsSearchResultSchema = z.object({
  path: z.string(),
  title: z.string(),
  line: z.number(),
  column: z.number(),
  end_column: z.number(),
  snippet: z.string(),
  snippet_highlights: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
    }),
  ),
  score: z.number(),
})

export const fsMarkdownBlockSchema = z.object({
  id: z.string(),
  kind: z.enum(['paragraph', 'blockquote', 'code', 'list', 'divider', 'table']),
  text: z.string().nullable().optional(),
  level: z.number().nullable().optional(),
  language: z.string().nullable().optional(),
  ordered: z.boolean().nullable().optional(),
  items: z.array(z.string()).nullable().optional(),
})

export const fsGraphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum(['file', 'heading', 'missing', 'external']),
  label: z.string(),
  path: z.string().nullable().optional(),
  line: z.number().nullable().optional(),
  level: z.number().nullable().optional(),
  slug: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  content_blocks: z.array(fsMarkdownBlockSchema).nullable().optional(),
  content_start_line: z.number().nullable().optional(),
  content_end_line: z.number().nullable().optional(),
})

export const fsGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['contains', 'links_to', 'references_heading']),
})

export const fsGraphSchema = z.object({
  mode: z.enum(['outline', 'mindmap']),
  nodes: z.array(fsGraphNodeSchema),
  edges: z.array(fsGraphEdgeSchema),
})

export const markdownAssetImportStrategySchema = z.enum([
  'copy-to-document-assets',
  'preserve-path',
])

export const fsMarkdownAssetImportResultSchema = z.object({
  markdown_target: z.string(),
  relative_path: z.string(),
  absolute_path: z.string(),
  asset_dir: z.string().nullable().optional(),
  copied: z.boolean(),
})

export const fsMarkdownAssetResolveResultSchema = z.object({
  source_path: z.string(),
  target: z.string(),
  absolute_path: z.string().nullable().optional(),
  relative_path: z.string().nullable().optional(),
  is_external: z.boolean(),
  media_type: z.string().nullable().optional(),
  exists: z.boolean(),
})

export type FsRootKind = z.infer<typeof fsRootInfoSchema>['kind']
export type FsEntry = z.infer<typeof fsEntrySchema>
export type FsRootInfo = z.infer<typeof fsRootInfoSchema>
export type FsSnapshot = z.infer<typeof fsSnapshotSchema>
export type FsPathMetadata = z.infer<typeof fsPathMetadataSchema>
export type FsBufferStatus = z.infer<typeof fsBufferStatusSchema>
export type BackgroundTaskStatus = z.infer<typeof backgroundTaskStatusSchema>
export type FsMarkdownHeading = z.infer<typeof fsMarkdownHeadingSchema>
export type FsMarkdownLink = z.infer<typeof fsMarkdownLinkSchema>
export type FsMarkdownAsset = z.infer<typeof fsMarkdownAssetSchema>
export type FsIndexedMarkdownFile = {
  path: string
  headings: FsMarkdownHeading[]
  links: FsMarkdownLink[]
  assets?: FsMarkdownAsset[]
}
export type FsWorkspaceIndex = {
  files: FsIndexedMarkdownFile[]
}
export type FsMarkdownDiagnostic = z.infer<typeof fsMarkdownDiagnosticSchema>
export type FsSearchResult = z.infer<typeof fsSearchResultSchema>
export type FsMarkdownBlock = z.infer<typeof fsMarkdownBlockSchema>
export type FsGraphNode = z.infer<typeof fsGraphNodeSchema>
export type FsGraphEdge = z.infer<typeof fsGraphEdgeSchema>
export type FsGraph = z.infer<typeof fsGraphSchema>
export type MarkdownAssetImportStrategy = z.infer<typeof markdownAssetImportStrategySchema>
export type FsMarkdownAssetImportResult = z.infer<typeof fsMarkdownAssetImportResultSchema>
export type FsMarkdownAssetResolveResult = z.infer<typeof fsMarkdownAssetResolveResultSchema>

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
  createFile(path: string) {
    return invoke('fs_create_file', { path })
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
  openPathInSystem(path: string) {
    return invoke<void>('fs_open_path_in_system', { path })
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
}
