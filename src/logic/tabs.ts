import uniqBy from 'lodash-es/uniqBy'
import type { FileViewKind, GitDiffSection, WorkspaceTab } from '@/store/appTypes'

const GIT_DIFF_SECTIONS = new Set<string>(['staged', 'unstaged', 'untracked', 'conflicts'])
const FILE_VIEWS = new Set<string>(['edit', 'source', 'preview'])

export const fileViewTabId = (path: string, view: FileViewKind) => `file:${view}:${path}`
export const fileTabId = (path: string) => fileViewTabId(path, 'edit')

export const gitDiffTabId = (section: GitDiffSection, path: string) => `git-diff:${section}:${path}`
export const webTabId = (id: string) => `web:${id}`

export const getWorkspaceTabId = (tab: WorkspaceTab) =>
  tab.kind === 'file'
    ? fileViewTabId(tab.path, tab.view)
    : tab.kind === 'git-diff'
      ? gitDiffTabId(tab.section, tab.path)
      : webTabId(tab.id)

export const createFileTab = (path: string, view: FileViewKind = 'edit'): WorkspaceTab => ({
  kind: 'file',
  view,
  path,
})

export const createGitDiffTab = (path: string, section: GitDiffSection): WorkspaceTab => ({
  kind: 'git-diff',
  path,
  section,
})

export const createWebTab = (
  url: string,
  title: string,
  id: string = globalThis.crypto.randomUUID(),
): Extract<WorkspaceTab, { kind: 'web' }> => ({
  kind: 'web',
  id,
  url: new URL(url.trim()).toString(),
  title,
})

export const getWorkspaceTabPath = (tab: WorkspaceTab | null | undefined) =>
  tab?.kind === 'file' || tab?.kind === 'git-diff' ? tab.path : null

export const getWorkspaceTabLabelPath = (tab: WorkspaceTab) =>
  tab.kind === 'web' ? tab.title : tab.path

export const areWorkspaceTabsEqual = (left: WorkspaceTab[], right: WorkspaceTab[]) => {
  if (left === right) return true
  if (left.length !== right.length) return false
  return left.every((tab, index) => {
    const next = right[index]
    if (!next || getWorkspaceTabId(tab) !== getWorkspaceTabId(next)) return false
    if (tab.kind !== 'web' || next.kind !== 'web') return true
    return tab.title === next.title && tab.url === next.url
  })
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const isGitDiffSection = (value: unknown): value is GitDiffSection =>
  typeof value === 'string' && GIT_DIFF_SECTIONS.has(value)

const isFileView = (value: unknown): value is FileViewKind =>
  typeof value === 'string' && FILE_VIEWS.has(value)

const isSafeWebUrl = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) return false
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && !url.username && !url.password
  } catch {
    return false
  }
}

const normalizeTabs = (value: unknown, allowWeb: boolean): WorkspaceTab[] => {
  if (!Array.isArray(value)) return []
  const tabs = value.flatMap((item): WorkspaceTab[] => {
    if (isNonEmptyString(item)) return [createFileTab(item)]
    if (!item || typeof item !== 'object') return []
    const tab = item as Partial<WorkspaceTab>
    if (tab.kind === 'file' && isNonEmptyString(tab.path)) {
      if (tab.view !== undefined && !isFileView(tab.view)) return []
      return [createFileTab(tab.path, tab.view ?? 'edit')]
    }
    if (tab.kind === 'git-diff' && isNonEmptyString(tab.path) && isGitDiffSection(tab.section)) {
      return [createGitDiffTab(tab.path, tab.section)]
    }
    if (
      allowWeb &&
      tab.kind === 'web' &&
      isNonEmptyString(tab.id) &&
      isSafeWebUrl(tab.url) &&
      isNonEmptyString(tab.title)
    ) {
      return [createWebTab(tab.url, tab.title, tab.id)]
    }
    return []
  })

  return uniqBy(tabs, getWorkspaceTabId)
}

export const normalizeWorkspaceTabs = (value: unknown) => normalizeTabs(value, false)

export const normalizeRuntimeWorkspaceTabs = (value: unknown) => normalizeTabs(value, true)

export const getPersistableWorkspaceTabs = (tabs: WorkspaceTab[]) =>
  tabs.filter((tab) => tab.kind !== 'web')

export const normalizeWorkspaceTabId = (value: unknown, tabs: WorkspaceTab[]) => {
  if (typeof value !== 'string') return tabs[0] ? getWorkspaceTabId(tabs[0]) : null
  const normalizedLegacyId =
    value.startsWith('file:') &&
    !value.startsWith('file:edit:') &&
    !value.startsWith('file:source:') &&
    !value.startsWith('file:preview:')
      ? `file:edit:${value.slice('file:'.length)}`
      : value
  return tabs.some((tab) => getWorkspaceTabId(tab) === normalizedLegacyId)
    ? normalizedLegacyId
    : tabs[0]
      ? getWorkspaceTabId(tabs[0])
      : null
}
