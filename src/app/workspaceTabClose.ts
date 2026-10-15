import type { NavigateFunction } from 'react-router-dom'
import type { WorkspaceTab } from '@/store/appTypes'
import { getWorkspaceTabId } from '@/logic/tabs'
import { getElectronRuntime, isElectronRuntime } from '@/runtime/electron'
import { navigateToTab, type LatestRef } from '@/app/workspaceTabNavigation'
import { requestGitConflictClose } from '@/features/git/conflicts/conflictDraftStore'

export type WorkspaceTabCloseContext = {
  rootPathRef: LatestRef<string | undefined>
  activeTabIdRef: LatestRef<string | null>
  inspectedPathRef: LatestRef<string | null>
  locationPathnameRef: LatestRef<string>
  tabsRef: LatestRef<WorkspaceTab[]>
  navigate: NavigateFunction
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

export const closeWorkspaceTab = (
  context: WorkspaceTabCloseContext,
  tabId: string,
  expectedRoot = context.rootPathRef.current,
) => {
  const {
    rootPathRef,
    tabsRef,
    activeTabIdRef,
    inspectedPathRef,
    locationPathnameRef,
    navigate,
    setTabs,
    setActiveTabId,
    setInspectedPath,
  } = context
  if (rootPathRef.current !== expectedRoot) return
  const close = () => {
    if (rootPathRef.current !== expectedRoot) return
    const currentTabs = tabsRef.current
    const closedIndex = currentTabs.findIndex((tab) => getWorkspaceTabId(tab) === tabId)
    if (closedIndex < 0) return
    const closedTab = currentTabs[closedIndex]!
    if (closedTab.kind === 'web' && isElectronRuntime()) {
      void getElectronRuntime()
        .webTabs.close({ tabId: closedTab.id })
        .catch(() => undefined)
    }
    const nextTabs = currentTabs.filter((tab) => getWorkspaceTabId(tab) !== tabId)
    setTabs(nextTabs)
    const closedPath =
      closedTab.kind === 'file' || closedTab.kind === 'git-diff' ? closedTab.path : null
    if (closedPath && inspectedPathRef.current === closedPath) {
      setInspectedPath(
        nextTabs.find((tab) => tab.kind === 'file' || tab.kind === 'git-diff')?.path ?? null,
      )
    }
    if (activeTabIdRef.current !== tabId) return
    const nextActive = nextTabs[Math.max(0, closedIndex - 1)] ?? nextTabs[0] ?? null
    setActiveTabId(nextActive ? getWorkspaceTabId(nextActive) : null)
    navigateToTab(nextActive, locationPathnameRef.current, navigate)
  }
  const tab = tabsRef.current.find((item) => getWorkspaceTabId(item) === tabId)
  if (
    expectedRoot &&
    tab?.kind === 'git-diff' &&
    tab.section === 'conflicts' &&
    requestGitConflictClose(expectedRoot, tab.path, close)
  ) {
    setActiveTabId(tabId)
    setInspectedPath(tab.path)
    navigateToTab(tab, locationPathnameRef.current, navigate)
    return
  }
  close()
}
