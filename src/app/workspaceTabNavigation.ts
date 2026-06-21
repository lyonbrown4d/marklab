import { startTransition } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { pathToFileViewRoute, pathToGitDiffRoute, pathToWorkspaceGraphRoute } from '@/logic/routing'
import { createFileTab, fileTabId, fileViewTabId, getWorkspaceTabId } from '@/logic/tabs'
import type { FileViewKind, WorkspaceTab } from '@/store/appTypes'

export type LatestRef<T> = {
  readonly current: T
}

export const navigateIfNeeded = (
  currentPathname: string,
  nextRoute: string,
  navigate: NavigateFunction,
) => {
  if (currentPathname === nextRoute) return
  startTransition(() => {
    navigate(nextRoute)
  })
}

export const navigateToTab = (
  tab: WorkspaceTab | null,
  currentPathname: string,
  navigate: NavigateFunction,
) => {
  if (tab?.kind === 'file') {
    navigateIfNeeded(currentPathname, pathToFileViewRoute(tab.path, tab.view), navigate)
    return
  }
  if (tab?.kind === 'workspace-graph') {
    navigateIfNeeded(currentPathname, pathToWorkspaceGraphRoute(), navigate)
    return
  }
  if (tab?.kind === 'git-diff') {
    navigateIfNeeded(currentPathname, pathToGitDiffRoute(tab.section, tab.path), navigate)
    return
  }
  navigateIfNeeded(currentPathname, '/', navigate)
}

export const openFileView = ({
  path,
  view,
  inspectedPathRef,
  tabsRef,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: {
  path: string
  view: FileViewKind
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}) => {
  const currentTabs = tabsRef.current
  const id = view === 'edit' ? fileTabId(path) : fileViewTabId(path, view)
  const nextTabs = currentTabs.some((tab) => getWorkspaceTabId(tab) === id)
    ? currentTabs
    : [...currentTabs, createFileTab(path, view)]
  if (nextTabs !== currentTabs) {
    setTabs(nextTabs)
  }
  setActiveTabId(id)
  if (inspectedPathRef.current !== path) {
    setInspectedPath(path)
  }
}
