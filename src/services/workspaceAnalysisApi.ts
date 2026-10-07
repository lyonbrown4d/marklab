import { z } from 'zod'
import pLimit from 'p-limit'
import { invoke } from '@/runtime/ipc'

const WORKSPACE_PAGE_LIMIT = 500
const WORKSPACE_PAGE_CONCURRENCY = 3

const headingSchema = z.object({
  path: z.string(),
  slug: z.string(),
  text: z.string(),
  level: z.number().int().min(1).max(6),
})

const navigationLinkSchema = z.object({
  source_path: z.string(),
  target_path: z.string(),
  target_anchor: z.string().nullable().optional(),
  target_heading_slug: z.string().nullable().optional(),
  target: z.string(),
  text: z.string(),
  context: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  link_type: z.enum(['markdown', 'wiki']),
})

const backlinkSchema = z.object({
  source_path: z.string(),
  text: z.string(),
  context: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  target_anchor: z.string().nullable().optional(),
  target_heading_slug: z.string().nullable().optional(),
})

const missingLinkSchema = z.object({
  path: z.string(),
  target: z.string(),
  text: z.string(),
  context: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  link_type: z.enum(['markdown', 'wiki']),
})

const documentHeadingSchema = headingSchema.extend({
  line: z.number().int().positive(),
  column: z.number().int().positive(),
})

const diagnosticSchema = z.object({
  line: z.number().int().positive(),
  start_column: z.number().int().positive(),
  end_column: z.number().int().positive(),
  message: z.string(),
  severity: z.enum(['error', 'warning']),
})

const assetReferenceSchema = z.object({
  id: z.string(),
  source_path: z.string(),
  target: z.string(),
  target_path: z.string().nullable(),
  media_type: z.string().nullable(),
  context: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().positive(),
  status: z.enum(['available', 'missing', 'unverified']),
})

const knowledgeLinkSchema = z.object({
  path: z.string(),
  label: z.string(),
  count: z.number().int().nonnegative(),
  first_line: z.number().int().positive(),
  first_column: z.number().int().positive(),
  first_text: z.string(),
  first_context: z.string(),
})

export const workspaceDocumentInsightsSchema = z.object({
  ready: z.literal(true),
  revision: z.number().int().nonnegative(),
  path: z.string(),
  found: z.boolean(),
  headings: z.array(documentHeadingSchema),
  backlinks: z.array(backlinkSchema),
  diagnostics: z.array(diagnosticSchema),
  asset_report: z.object({
    current_assets: z.array(assetReferenceSchema),
    current_asset_count: z.number().int().nonnegative(),
    current_missing_count: z.number().int().nonnegative(),
    workspace_missing_assets: z.array(assetReferenceSchema),
    workspace_missing_count: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative(),
  }),
  knowledge: z.object({
    incoming: z.array(knowledgeLinkSchema),
    outgoing: z.array(knowledgeLinkSchema),
    missing: z.array(missingLinkSchema.omit({ path: true })),
    incoming_count: z.number().int().nonnegative(),
    outgoing_count: z.number().int().nonnegative(),
    missing_count: z.number().int().nonnegative(),
    orphan: z.boolean(),
  }),
})

export const workspaceNavigationResultSchema = z.object({
  ready: z.literal(true),
  revision: z.number().int().nonnegative(),
  active_path: z.string().nullable(),
  files: z.array(z.object({ path: z.string(), title: z.string() })),
  headings: z.array(headingSchema),
  file_total: z.number().int().nonnegative(),
  heading_total: z.number().int().nonnegative(),
  current: z.object({
    headings: z.array(headingSchema),
    outgoing_links: z.array(navigationLinkSchema),
    backlinks: z.array(backlinkSchema),
    missing_links: z.array(missingLinkSchema),
    heading_total: z.number().int().nonnegative(),
    outgoing_link_total: z.number().int().nonnegative(),
    backlink_total: z.number().int().nonnegative(),
    missing_link_total: z.number().int().nonnegative(),
  }),
  limit: z.number().int().positive(),
})

export const workspaceKnowledgeSummarySchema = z.object({
  ready: z.literal(true),
  revision: z.number().int().nonnegative(),
  file_count: z.number().int().nonnegative(),
  heading_count: z.number().int().nonnegative(),
  internal_link_count: z.number().int().nonnegative(),
  linked_file_count: z.number().int().nonnegative(),
  missing_link_count: z.number().int().nonnegative(),
  orphan_file_count: z.number().int().nonnegative(),
  collection_counts: z.object({
    all: z.number().int().nonnegative(),
    'needs-attention': z.number().int().nonnegative(),
    linked: z.number().int().nonnegative(),
    structured: z.number().int().nonnegative(),
  }),
})

const workspacePageRequestSchema = z
  .object({
    folder: z.string().optional(),
    issues_only: z.boolean().optional(),
    query: z.string().optional(),
    sort: z.enum(['title', 'path', 'headings', 'links', 'issues']).optional(),
    offset: z.number().int().nonnegative().optional(),
    limit: z.number().int().min(1).max(WORKSPACE_PAGE_LIMIT).optional(),
  })
  .strict()

export const workspacePageResultSchema = z.object({
  ready: z.literal(true),
  revision: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
      folder: z.string(),
      heading_count: z.number().int().nonnegative(),
      link_count: z.number().int().nonnegative(),
      asset_count: z.number().int().nonnegative(),
      issue_count: z.number().int().nonnegative(),
    }),
  ),
  folders: z.array(z.string()),
  total: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
})

export type WorkspaceNavigationScope = 'all' | 'files' | 'headings'

export type WorkspaceNavigationRequest = {
  active_path?: string | null
  query?: string
  scope?: WorkspaceNavigationScope
  limit?: number
}

export type WorkspaceNavigationResult = z.infer<typeof workspaceNavigationResultSchema>
export type WorkspaceKnowledgeSummaryResult = z.infer<typeof workspaceKnowledgeSummarySchema>
export type WorkspaceDocumentInsightsResult = z.infer<typeof workspaceDocumentInsightsSchema>
export type WorkspacePageRequest = z.input<typeof workspacePageRequestSchema>
export type WorkspacePageQuery = Omit<WorkspacePageRequest, 'offset' | 'limit'>
export type WorkspacePageResult = z.infer<typeof workspacePageResultSchema>

const queryPages = async (request: WorkspacePageRequest): Promise<WorkspacePageResult> => {
  const payload = workspacePageRequestSchema.parse(request)
  const result = await invoke<unknown>('fs_query_workspace_pages', payload)
  return workspacePageResultSchema.parse(result)
}

const queryAllPages = async (request: WorkspacePageQuery): Promise<WorkspacePageResult> => {
  const first = await queryPages({ ...request, offset: 0, limit: WORKSPACE_PAGE_LIMIT })
  if (first.items.length >= first.total) return first

  const offsets = Array.from(
    { length: Math.ceil((first.total - WORKSPACE_PAGE_LIMIT) / WORKSPACE_PAGE_LIMIT) },
    (_, index) => (index + 1) * WORKSPACE_PAGE_LIMIT,
  )
  const limit = pLimit(WORKSPACE_PAGE_CONCURRENCY)
  const remaining = await Promise.all(
    offsets.map((offset) =>
      limit(() => queryPages({ ...request, offset, limit: WORKSPACE_PAGE_LIMIT })),
    ),
  )
  if (remaining.some((page) => page.revision !== first.revision)) {
    throw new Error('Workspace page index changed while loading')
  }
  return {
    ...first,
    items: [first, ...remaining].flatMap((page) => page.items),
  }
}

export const workspaceAnalysisApi = {
  queryAllPages,
  async queryNavigation(request: WorkspaceNavigationRequest) {
    const result = await invoke<unknown>('fs_query_workspace_navigation', request)
    return workspaceNavigationResultSchema.parse(result)
  },
  async getKnowledgeSummary() {
    const result = await invoke<unknown>('fs_get_workspace_knowledge_summary')
    return workspaceKnowledgeSummarySchema.parse(result)
  },
  async getDocumentInsights(request: { path: string; asset_limit?: number }) {
    const result = await invoke<unknown>('fs_get_workspace_document_insights', request)
    return workspaceDocumentInsightsSchema.parse(result)
  },
}
