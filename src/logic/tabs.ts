import uniqBy from 'lodash-es/uniqBy'
import type { FileViewKind, GitDiffSection, WorkspaceTab } from '@/store/appTypes'

const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])
const FILE_VIEWS = new Set<string>(['edit', 'source', 'graph', 'preview'])

export const fileViewTabId = (path: string, view: FileViewKind) => `file:${view}:${path}`
export const fileTabId = (path: string) => fileViewTabId(path, 'edit')

export const gitDiffTabId = (section: GitDiffSection, path: string) => `git-diff:${section}:${path}`
export const workspaceGraphTabId = () => 'workspace-graph'

export const getWorkspaceTabId = (tab: WorkspaceTab) =>
  tab.kind === 'file'
    ? fileViewTabId(tab.path, tab.view)
    : tab.kind === 'workspace-graph'
      ? workspaceGraphTabId()
      : gitDiffTabId(tab.section, tab.path)

export const createFileTab = (path: string, view: FileViewKind = 'edit'): WorkspaceTab => ({
  kind: 'file',
  view,
  path,
})

export const createWorkspaceGraphTab = (): WorkspaceTab => ({ kind: 'workspace-graph' })

export const createGitDiffTab = (path: string, section: GitDiffSection): WorkspaceTab => ({
  kind: 'git-diff',
  path,
  section,
})

export const getWorkspaceTabPath = (tab: WorkspaceTab | null | undefined) =>
  tab?.kind === 'file' || tab?.kind === 'git-diff' ? tab.path : null

export const getWorkspaceTabLabelPath = (tab: WorkspaceTab) =>
  tab.kind === 'workspace-graph' ? 'Workspace Graph' : tab.path

export const areWorkspaceTabsEqual = (left: WorkspaceTab[], right: WorkspaceTab[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((tab, index) => getWorkspaceTabId(tab) === getWorkspaceTabId(right[index]))
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isGitDiffSection = (value: unknown): value is GitDiffSection =>
  typeof value === 'string' && GIT_DIFF_SECTIONS.has(value)

const isFileView = (value: unknown): value is FileViewKind =>
  typeof value === 'string' && FILE_VIEWS.has(value)

export const normalizeWorkspaceTabs = (value: unknown): WorkspaceTab[] => {
  if (!Array.isArray(value)) return []
  const tabs = value.flatMap((item): WorkspaceTab[] => {
    if (isNonEmptyString(item)) return [createFileTab(item)]
    if (!item || typeof item !== 'object') return []
    const tab = item as Partial<WorkspaceTab>
    if (tab.kind === 'file' && isNonEmptyString(tab.path)) {
      return [createFileTab(tab.path, isFileView(tab.view) ? tab.view : 'edit')]
    }
    if (tab.kind === 'workspace-graph') {
      return [createWorkspaceGraphTab()]
    }
    if (tab.kind === 'git-diff' && isNonEmptyString(tab.path) && isGitDiffSection(tab.section)) {
      return [createGitDiffTab(tab.path, tab.section)]
    }
    return []
  })

  return uniqBy(tabs, getWorkspaceTabId)
}

export const normalizeWorkspaceTabId = (value: unknown, tabs: WorkspaceTab[]) => {
  if (typeof value !== 'string') return tabs[0] ? getWorkspaceTabId(tabs[0]) : null
  const normalizedLegacyId =
    value.startsWith('file:') &&
    !value.startsWith('file:edit:') &&
    !value.startsWith('file:source:') &&
    !value.startsWith('file:graph:') &&
    !value.startsWith('file:preview:')
      ? `file:edit:${value.slice('file:'.length)}`
      : value
  return tabs.some((tab) => getWorkspaceTabId(tab) === normalizedLegacyId)
    ? normalizedLegacyId
    : tabs[0]
      ? getWorkspaceTabId(tabs[0])
      : null
}
