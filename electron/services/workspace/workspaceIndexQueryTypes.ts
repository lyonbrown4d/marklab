import type { FsMarkdownDiagnostic, FsMarkdownHeading } from '@electron/services/workspace/types'

export type WorkspaceIndexQueryMeta = {
  ready: true
  revision: number
}

export type WorkspacePageSort = 'title' | 'path' | 'headings' | 'links' | 'issues'

export type WorkspacePageQuery = {
  folder?: string
  issues_only?: boolean
  query?: string
  sort?: WorkspacePageSort
  offset?: number
  limit?: number
}

export type WorkspacePageSummary = {
  path: string
  title: string
  folder: string
  heading_count: number
  link_count: number
  asset_count: number
  issue_count: number
}

export type WorkspacePageQueryResult = WorkspaceIndexQueryMeta & {
  items: WorkspacePageSummary[]
  folders: string[]
  total: number
  offset: number
  limit: number
}

export type WorkspaceNavigationScope = 'all' | 'files' | 'headings'

export type WorkspaceNavigationQuery = {
  active_path?: string | null
  query?: string
  scope?: WorkspaceNavigationScope
  limit?: number
}

export type WorkspaceNavigationHeading = Pick<FsMarkdownHeading, 'path' | 'slug' | 'text' | 'level'>

export type WorkspaceNavigationLink = {
  source_path: string
  target_path: string
  target_anchor?: string | null
  target_heading_slug?: string | null
  target: string
  text: string
  context: string
  line: number
  column: number
  link_type: 'markdown' | 'wiki'
}

export type WorkspaceBacklink = {
  source_path: string
  text: string
  context: string
  line: number
  column: number
  target_anchor?: string | null
  target_heading_slug?: string | null
}

export type WorkspaceMissingLink = {
  path: string
  target: string
  text: string
  context: string
  line: number
  column: number
  link_type: 'markdown' | 'wiki'
}

export type WorkspaceCurrentNavigation = {
  headings: WorkspaceNavigationHeading[]
  outgoing_links: WorkspaceNavigationLink[]
  backlinks: WorkspaceBacklink[]
  missing_links: WorkspaceMissingLink[]
  heading_total: number
  outgoing_link_total: number
  backlink_total: number
  missing_link_total: number
}

export type WorkspaceNavigationQueryResult = WorkspaceIndexQueryMeta & {
  active_path: string | null
  files: Array<{ path: string; title: string }>
  headings: WorkspaceNavigationHeading[]
  file_total: number
  heading_total: number
  current: WorkspaceCurrentNavigation
  limit: number
}

export type WorkspaceKnowledgeLink = {
  path: string
  label: string
  count: number
  first_line: number
  first_column: number
  first_text: string
  first_context: string
}

export type WorkspaceMissingReference = {
  target: string
  text: string
  link_type: 'markdown' | 'wiki'
  line: number
  column: number
  context: string
}

export type WorkspaceKnowledgeInsights = {
  incoming: WorkspaceKnowledgeLink[]
  outgoing: WorkspaceKnowledgeLink[]
  missing: WorkspaceMissingReference[]
  incoming_count: number
  outgoing_count: number
  missing_count: number
  orphan: boolean
}

export type WorkspaceKnowledgeSummary = WorkspaceIndexQueryMeta & {
  file_count: number
  heading_count: number
  internal_link_count: number
  linked_file_count: number
  missing_link_count: number
  orphan_file_count: number
  collection_counts: Record<'all' | 'needs-attention' | 'linked' | 'structured', number>
}

export type WorkspaceAssetStatus = 'available' | 'missing' | 'unverified'

export type WorkspaceAssetReference = {
  id: string
  source_path: string
  target: string
  target_path: string | null
  media_type: string | null
  context: string
  line: number
  column: number
  status: WorkspaceAssetStatus
}

export type WorkspaceAssetReport = {
  current_assets: WorkspaceAssetReference[]
  current_asset_count: number
  current_missing_count: number
  workspace_missing_assets: WorkspaceAssetReference[]
  workspace_missing_count: number
  limit: number
}

export type WorkspaceDocumentInsights = WorkspaceIndexQueryMeta & {
  path: string
  found: boolean
  headings: FsMarkdownHeading[]
  backlinks: WorkspaceBacklink[]
  diagnostics: FsMarkdownDiagnostic[]
  asset_report: WorkspaceAssetReport
  knowledge: WorkspaceKnowledgeInsights
}
