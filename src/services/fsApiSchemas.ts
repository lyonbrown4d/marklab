import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'
import { MAX_WORKSPACE_TEXT_PREVIEW_BYTES } from '@/types/workspaceTextPreview'
export * from '@/services/fsBufferSchemas'

export const fsRootInfoSchema = z.object({
  kind: z.enum(['internal', 'external', 'single']),
  path: z.string(),
}) satisfies z.ZodType<FsRootInfo>

export const fsEntrySchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'folder']),
  name: z.string(),
}) satisfies z.ZodType<FsEntry>

export const fsSnapshotSchema = z.object({
  root: fsRootInfoSchema,
  entries: z.array(fsEntrySchema),
}) satisfies z.ZodType<FsSnapshot>

export const fsPathMetadataSchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'folder']),
  size_bytes: z.number(),
  modified_ms: z.number().optional(),
  readonly: z.boolean(),
}) satisfies z.ZodType<FsPathMetadata>

export const fsTextPreviewLimitSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_WORKSPACE_TEXT_PREVIEW_BYTES)

export const fsTextPreviewSchema = z
  .object({
    content: z.string(),
    truncated: z.boolean(),
  })
  .strict() satisfies z.ZodType<FsTextPreview>

export const opaqueAssetUrlSchema = z
  .string()
  .regex(
    /^marklab-asset:\/\/local\/v1\/[A-Za-z0-9._~-]+$/,
    'Expected a strict marklab-asset capability URL',
  )

const isWorkspaceRelativeAssetPath = (value: string) => {
  if (!value || !value.trim() || value.includes('\0') || value.includes('#')) return false

  const candidate = value.trimStart()
  if (/^[\\/]/.test(candidate)) return false
  if (/^[A-Za-z]:/.test(candidate)) return false
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(candidate)) return false

  let depth = 0
  for (const segment of value.replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (depth === 0) return false
      depth -= 1
      continue
    }
    depth += 1
  }
  return depth > 0
}

export const workspaceRelativeAssetPathSchema = z
  .string()
  .refine(isWorkspaceRelativeAssetPath, 'Expected a safe workspace-relative asset path')

export const fsAssetCapabilitySchema = z
  .object({
    url: opaqueAssetUrlSchema,
    expires_at_ms: z.number().int().nonnegative(),
  })
  .strict() satisfies z.ZodType<FsAssetCapability>

export const backgroundTaskStatusSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.enum(['idle', 'running', 'error']),
  message: z.string().nullable(),
}) satisfies z.ZodType<BackgroundTaskStatus>

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
}) satisfies z.ZodType<FsSearchResult>

export const workspaceOccurrenceSearchOptionsSchema = z
  .object({
    caseSensitive: z.boolean(),
    wholeWord: z.boolean(),
    useRegex: z.boolean(),
  })
  .strict() satisfies z.ZodType<WorkspaceOccurrenceSearchOptions>

export const workspaceOccurrenceSearchRequestSchema = z
  .object({
    requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/),
    query: z
      .string()
      .min(1)
      .max(256)
      .refine((value) => value.trim().length > 0, 'Query must not be blank'),
    limit: z.number().int().min(1).max(500).nullish(),
    options: workspaceOccurrenceSearchOptionsSchema,
  })
  .strict() satisfies z.ZodType<WorkspaceOccurrenceSearchRequest>

export const workspaceOccurrenceSearchResultSetSchema = z
  .object({
    requestId: z.string(),
    results: z.array(fsSearchResultSchema),
    totalHits: z.number().int().nonnegative(),
    scannedDocuments: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict() satisfies z.ZodType<WorkspaceOccurrenceSearchResultSet>

export const workspaceOccurrenceSearchCancelResultSchema = z
  .object({ requestId: z.string(), cancelled: z.boolean() })
  .strict() satisfies z.ZodType<WorkspaceOccurrenceSearchCancelResult>

export const fsMarkdownBlockSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string(), kind: z.literal('paragraph'), text: z.string() }),
  z.object({ id: z.string(), kind: z.literal('blockquote'), text: z.string() }),
  z.object({ id: z.string(), kind: z.literal('code'), text: z.string(), language: z.string() }),
]) satisfies z.ZodType<FsMarkdownBlock>

const graphPreviewNodeFields = {
  id: z.string(),
  label: z.string(),
  path: z.string(),
  source_path: z.string(),
  target: z.string(),
  preview_kind: z.enum([
    'audio',
    'docx',
    'drawio',
    'excalidraw',
    'image',
    'pdf',
    'source',
    'spreadsheet',
    'video',
  ]),
}
export const fsGraphNodeSchema = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('file'),
    label: z.string(),
    path: z.string(),
    group: z.object({ key: z.string(), label: z.string(), source: z.literal('path') }),
  }),
  z.object({ ...graphPreviewNodeFields, kind: z.literal('preview') }),
  z.object({ ...graphPreviewNodeFields, kind: z.literal('missing') }),
]) satisfies z.ZodType<FsGraphNode>

export const fsGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['links_to', 'references_heading', 'previews']),
}) satisfies z.ZodType<FsGraphEdge>

export const fsGraphSchema = z.object({
  mode: z.literal('mindmap'),
  revision: z.string(),
  nodes: z.array(fsGraphNodeSchema),
  edges: z.array(fsGraphEdgeSchema),
}) satisfies z.ZodType<FsGraph>

export const workspaceGraphNodeDetailsRequestSchema = z
  .object({
    node_ids: z.array(z.string().min(1).max(1_024)).min(1).max(256),
    mode: z.enum(['summary', 'full']),
    max_nodes: z.number().int().min(1).max(64).nullish(),
    revision: z.string().min(1),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphNodeDetailsRequest>

export const workspaceGraphPreviewSchema = z
  .object({
    html: z.string().max(32_768),
    math: z
      .array(
        z
          .object({
            id: z.string().regex(/^graph-math-\d{1,2}$/),
            expression: z.string().max(1_680),
            displayMode: z.boolean(),
          })
          .strict(),
      )
      .max(64),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphPreview>

export type WorkspaceGraphPreview =
  DesktopCommandResults['fs_get_workspace_graph_node_details']['items'][number]['preview']

export const workspaceGraphNodeDetailsResultSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          content: z.string(),
          preview: workspaceGraphPreviewSchema,
          content_blocks: z.array(fsMarkdownBlockSchema).optional(),
        })
        .strict(),
    ),
    revision: z.string().min(1),
    truncated: z.boolean(),
  })
  .strict() satisfies z.ZodType<WorkspaceGraphNodeDetailsResult>

export const markdownAssetImportStrategySchema = z.enum([
  'copy-to-document-assets',
  'preserve-path',
]) satisfies z.ZodType<MarkdownAssetImportStrategy>

export const fsMarkdownAssetImportResultSchema = z.object({
  markdown_target: z.string(),
  relative_path: z.string().nullable(),
  asset_dir: z.string().nullable(),
  copied: z.boolean(),
}) satisfies z.ZodType<FsMarkdownAssetImportResult>

export const fsMarkdownAssetResolveResultSchema = z.object({
  source_path: z.string(),
  target: z.string(),
  relative_path: z.string().nullable(),
  is_external: z.boolean(),
  media_type: z.string().nullable(),
  exists: z.boolean(),
}) satisfies z.ZodType<FsMarkdownAssetResolveResult>

export type FsRootKind = DesktopCommandResults['fs_get_root_info']['kind']
export type FsEntry = DesktopCommandResults['fs_list_entries'][number]
export type FsRootInfo = DesktopCommandResults['fs_get_root_info']
export type FsSnapshot = DesktopCommandResults['fs_get_snapshot']
export type FsPathMetadata = DesktopCommandResults['fs_get_path_metadata']
export type FsAssetCapability = DesktopCommandResults['assets_issue_capability']
export type FsTextPreview = DesktopCommandResults['workspace_read_text_preview']
export type WorkspaceGraphNodeDetailsRequest =
  DesktopCommandArgs['fs_get_workspace_graph_node_details']['request']
export type WorkspaceGraphNodeDetailsResult =
  DesktopCommandResults['fs_get_workspace_graph_node_details']
export type BackgroundTaskStatus = DesktopCommandResults['fs_get_background_tasks'][number]
export type FsSearchResult = DesktopCommandResults['fs_search_workspace'][number]
export type WorkspaceOccurrenceSearchOptions =
  DesktopCommandArgs['fs_search_workspace_occurrences']['request']['options']
export type WorkspaceOccurrenceSearchRequest =
  DesktopCommandArgs['fs_search_workspace_occurrences']['request']
export type WorkspaceOccurrenceSearchResultSet =
  DesktopCommandResults['fs_search_workspace_occurrences']
export type WorkspaceOccurrenceSearchCancelResult =
  DesktopCommandResults['fs_cancel_workspace_occurrence_search']
export type FsMarkdownBlock = NonNullable<
  WorkspaceGraphNodeDetailsResult['items'][number]['content_blocks']
>[number]
export type FsGraphNode = FsGraph['nodes'][number]
export type FsGraphEdge = FsGraph['edges'][number]
export type FsGraph = DesktopCommandResults['fs_get_workspace_graph']
export type MarkdownAssetImportStrategy =
  DesktopCommandArgs['fs_import_markdown_asset']['request']['strategy']
export type FsMarkdownAssetImportResult = DesktopCommandResults['fs_import_markdown_asset']
export type FsMarkdownAssetResolveResult = DesktopCommandResults['fs_resolve_markdown_asset']
