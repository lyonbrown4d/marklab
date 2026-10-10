import { fileLabel } from '@electron/services/workspace/markdown/utils'
import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@electron/services/workspace/types'
import type {
  WorkspacePageQuery,
  WorkspacePageQueryResult,
  WorkspacePageSummary,
} from '@electron/services/workspace/workspaceIndexQueryTypes'

const DEFAULT_PAGE_LIMIT = 100
const MAX_PAGE_LIMIT = 500

export type WorkspacePageProjection = Pick<WorkspacePageQueryResult, 'folders' | 'items' | 'total'>

export const prepareWorkspacePageQuery = (
  index: FsWorkspaceIndex,
  query: WorkspacePageQuery = {},
): WorkspacePageProjection => {
  const folder = query.folder?.trim() || 'all'
  const text = query.query?.trim().toLocaleLowerCase() ?? ''
  const pages = index.files.map(pageSummary)
  const items = pages.filter((page) => {
    if (folder !== 'all' && page.folder !== folder) return false
    if (query.issues_only && page.issue_count === 0) return false
    return !text || `${page.title}\n${page.path}\n${page.folder}`.toLocaleLowerCase().includes(text)
  })
  items.sort(pageComparator(query.sort ?? 'title'))
  return { folders: uniqueFolders(pages), items, total: items.length }
}

export const paginateWorkspacePages = (
  projection: WorkspacePageProjection,
  revision: number,
  query: WorkspacePageQuery = {},
): WorkspacePageQueryResult => {
  const offset = boundedInteger(query.offset, 0, Number.MAX_SAFE_INTEGER, 0)
  const limit = boundedInteger(query.limit, 1, MAX_PAGE_LIMIT, DEFAULT_PAGE_LIMIT)
  return {
    ready: true,
    revision,
    items: projection.items.slice(offset, offset + limit),
    folders: projection.folders,
    total: projection.total,
    offset,
    limit,
  }
}

export const queryWorkspacePages = (
  index: FsWorkspaceIndex,
  revision: number,
  query: WorkspacePageQuery = {},
): WorkspacePageQueryResult =>
  paginateWorkspacePages(prepareWorkspacePageQuery(index, query), revision, query)

export const pageSummary = (file: FsIndexedMarkdownFile): WorkspacePageSummary => ({
  path: file.path,
  title: file.headings.find((heading) => heading.level === 1)?.text ?? fileLabel(file.path),
  folder: folderName(file.path),
  heading_count: file.headings.length,
  link_count: file.links.length,
  asset_count: file.assets.length,
  issue_count: pageIssueCount(file),
})

const pageIssueCount = (file: FsIndexedMarkdownFile): number =>
  (file.structural_diagnostics?.length ?? 0) +
  file.links.filter(
    (link) =>
      !link.is_external &&
      Boolean(link.target.trim()) &&
      (!link.target_path || Boolean(link.target_anchor && !link.target_heading_slug)),
  ).length +
  file.assets.filter(
    (asset) => !asset.is_external && Boolean(asset.target.trim()) && !asset.target_path,
  ).length

const pageComparator =
  (sort: NonNullable<WorkspacePageQuery['sort']>) =>
  (left: WorkspacePageSummary, right: WorkspacePageSummary): number => {
    if (sort === 'path') return left.path.localeCompare(right.path)
    if (sort === 'headings')
      return right.heading_count - left.heading_count || left.path.localeCompare(right.path)
    if (sort === 'links')
      return right.link_count - left.link_count || left.path.localeCompare(right.path)
    if (sort === 'issues')
      return right.issue_count - left.issue_count || left.path.localeCompare(right.path)
    return left.title.localeCompare(right.title) || left.path.localeCompare(right.path)
  }

const folderName = (path: string): string => {
  const parts = path.split('/').filter(Boolean)
  return parts.length <= 1 ? '/' : parts.slice(0, -1).join('/')
}

const uniqueFolders = (pages: WorkspacePageSummary[]): string[] =>
  [...new Set(pages.map((page) => page.folder))].sort((left, right) => left.localeCompare(right))

const boundedInteger = (value: number | undefined, min: number, max: number, fallback: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value!))) : fallback
