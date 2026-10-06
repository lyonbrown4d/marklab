import { z } from 'zod'
import { MAX_WORKSPACE_TEXT_PREVIEW_BYTES } from '@/types/workspaceTextPreview'

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

const arrayBufferSchema = z
  .custom<ArrayBuffer | ArrayBufferView>(
    (value) => value instanceof ArrayBuffer || ArrayBuffer.isView(value),
  )
  .transform((value) => {
    if (value instanceof ArrayBuffer) return value
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)
  })

export const fsPathMetadataSchema = z.object({
  path: z.string(),
  kind: z.enum(['file', 'folder']),
  size_bytes: z.number(),
  modified_ms: z.number().optional(),
  readonly: z.boolean(),
})

export const fsAssetBytesSchema = z.object({
  bytes: arrayBufferSchema,
  media_type: z.string().nullable().optional(),
  size_bytes: z.number(),
})

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
  .strict()

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
  .strict()

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
  text: z.string().nullable().optional(),
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
  paths: z.array(z.string()).optional(),
  asset_paths: z.array(z.string()).optional(),
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
  group: z
    .object({
      key: z.string(),
      label: z.string(),
      source: z.enum(['frontmatter', 'path', 'semantic', 'workspace']),
    })
    .nullable()
    .optional(),
})

export const fsGraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  kind: z.enum(['contains', 'links_to', 'references_heading']),
})

export const fsGraphSchema = z.object({
  mode: z.literal('mindmap'),
  nodes: z.array(fsGraphNodeSchema),
  edges: z.array(fsGraphEdgeSchema),
})

export const markdownAssetImportStrategySchema = z.enum([
  'copy-to-document-assets',
  'preserve-path',
])

export const fsMarkdownAssetImportResultSchema = z.object({
  markdown_target: z.string(),
  relative_path: z.string().nullable(),
  asset_dir: z.string().nullable().optional(),
  copied: z.boolean(),
})

export const fsMarkdownAssetResolveResultSchema = z.object({
  source_path: z.string(),
  target: z.string(),
  relative_path: z.string().nullable(),
  is_external: z.boolean(),
  media_type: z.string().nullable().optional(),
  exists: z.boolean(),
})

export type FsRootKind = z.infer<typeof fsRootInfoSchema>['kind']
export type FsEntry = z.infer<typeof fsEntrySchema>
export type FsRootInfo = z.infer<typeof fsRootInfoSchema>
export type FsSnapshot = z.infer<typeof fsSnapshotSchema>
export type FsPathMetadata = z.infer<typeof fsPathMetadataSchema>
export type FsAssetBytes = z.infer<typeof fsAssetBytesSchema>
export type FsAssetCapability = z.infer<typeof fsAssetCapabilitySchema>
export type FsTextPreview = z.infer<typeof fsTextPreviewSchema>
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
  paths?: string[]
  asset_paths?: string[]
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
