import { generatePath } from 'react-router-dom'
import type { FileViewKind, GitDiffSection } from '@/store/appTypes'

const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])
const SIDEBAR_ACTIVITIES = new Set<string>(['explorer', 'search', 'scm', 'graph', 'projects'])

export const FILE_ROUTE_PATTERN = '/files/edit/*'
export const GIT_DIFF_ROUTE_PATTERN = '/_diff/:section/*'
export const SOURCE_ROUTE_PATTERN = '/files/source/*'
export const GRAPH_FILE_ROUTE_PATTERN = '/files/graph/*'
export const PREVIEW_ROUTE_PATTERN = '/files/preview/*'
export const ALL_PAGES_ROUTE_PATTERN = '/workspace/pages'
export const GRAPH_WORKSPACE_ROUTE_PATTERN = '/workspace/graph'
export const SIDEBAR_ACTIVITY_PARAM = 'sidebar'
export type SidebarActivityId = 'explorer' | 'search' | 'scm' | 'graph' | 'projects'

export const fileViewToRoutePattern = (view: FileViewKind) => {
  if (view === 'source') return SOURCE_ROUTE_PATTERN
  if (view === 'graph') return GRAPH_FILE_ROUTE_PATTERN
  if (view === 'preview') return PREVIEW_ROUTE_PATTERN
  return FILE_ROUTE_PATTERN
}

export const pathToRoute = (path: string) => {
  return pathToFileViewRoute(path, 'edit')
}

export const pathToFileViewRoute = (path: string, view: FileViewKind) => {
  const trimmed = path.trim()
  if (!trimmed) return '/'
  return generatePath(fileViewToRoutePattern(view), { '*': trimmed })
}

export const pathToGitDiffRoute = (section: GitDiffSection, path: string) => {
  return generatePath(GIT_DIFF_ROUTE_PATTERN, { section, '*': path })
}

export const pathToSourceRoute = (path: string) => {
  return pathToFileViewRoute(path, 'source')
}

export const pathToGraphFileRoute = (path: string) => {
  return pathToFileViewRoute(path, 'graph')
}

export const pathToWorkspaceGraphRoute = () => generatePath(GRAPH_WORKSPACE_ROUTE_PATTERN)

export const pathToAllPagesRoute = (collectionId?: string) => {
  const route = generatePath(ALL_PAGES_ROUTE_PATTERN)
  if (!collectionId || collectionId === 'all') return route
  return `${route}?collection=${encodeURIComponent(collectionId)}`
}

export const isGitDiffSection = (value: string | null | undefined): value is GitDiffSection =>
  Boolean(value && GIT_DIFF_SECTIONS.has(value))

export const isSidebarActivity = (value: string | null | undefined): value is SidebarActivityId =>
  Boolean(value && SIDEBAR_ACTIVITIES.has(value))
