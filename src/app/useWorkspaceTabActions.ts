import { startTransition, useCallback, type Dispatch, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { pathToFileViewRoute, pathToGitDiffRoute, pathToWorkspaceGraphRoute } from '@/logic/routing'
import {
  createFileTab,
  createGitDiffTab,
  createWorkspaceGraphTab,
  fileViewTabId,
  fileTabId,
  getWorkspaceTabId,
  gitDiffTabId,
  workspaceGraphTabId,
} from '@/logic/tabs'
import type { FileViewKind, GitDiffSection, ViewMode, WorkspaceTab } from '@/store/useAppStore'

type LatestRef<T> = {
  readonly current: T
}

type UseWorkspaceTabActionsArgs = {
  activeTabIdRef: LatestRef<string | null>
  currentFilePathRef: LatestRef<string | null>
  inspectedPathRef: LatestRef<string | null>
  locationPathnameRef: LatestRef<string>
  tabsRef: LatestRef<WorkspaceTab[]>
  navigate: NavigateFunction
  setTabViewModes: Dispatch<SetStateAction<Record<string, ViewMode>>>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
  defaultFileView: FileViewKind
}

export const useWorkspaceTabActions = ({
  activeTabIdRef,
  currentFilePathRef,
  inspectedPathRef,
  locationPathnameRef,
  tabsRef,
  navigate,
  setTabViewModes,
  setTabs,
  setActiveTabId,
  setInspectedPath,
  defaultFileView,
}: UseWorkspaceTabActionsArgs) => {
  const setViewMode = useCallback(
    (mode: ViewMode) => {
      const tab = tabsRef.current.find((item) => getWorkspaceTabId(item) === activeTabIdRef.current)
      const path = currentFilePathRef.current ?? (tab?.kind === 'file' ? tab.path : null)
      if (!path && mode !== 'graph') return
      const fileView: FileViewKind =
        mode === 'source' ? 'source' : mode === 'graph' && path ? 'graph' : 'edit'

      if (path) {
        setTabViewModes((prev) => (prev[path] === mode ? prev : { ...prev, [path]: mode }))
        openFileView({
          path,
          view: fileView,
          inspectedPathRef,
          tabsRef,
          setTabs,
          setActiveTabId,
          setInspectedPath,
        })
      }

      const nextRoute =
        mode === 'graph' && !path
          ? pathToWorkspaceGraphRoute()
          : path
            ? pathToFileViewRoute(path, fileView)
            : '/'
      navigateIfNeeded(locationPathnameRef.current, nextRoute, navigate)
    },
    [
      activeTabIdRef,
      currentFilePathRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setTabViewModes,
      setActiveTabId,
      setInspectedPath,
      setTabs,
      tabsRef,
    ],
  )

  const onOpenFileView = useCallback(
    (relativePath: string, view: FileViewKind = 'edit') => {
      openFileView({
        path: relativePath,
        view,
        inspectedPathRef,
        tabsRef,
        setTabs,
        setActiveTabId,
        setInspectedPath,
      })
      navigateIfNeeded(
        locationPathnameRef.current,
        pathToFileViewRoute(relativePath, view),
        navigate,
      )
    },
    [
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setInspectedPath,
      setTabs,
      tabsRef,
    ],
  )

  const onOpenFile = useCallback(
    (relativePath: string) => {
      onOpenFileView(relativePath, defaultFileView)
    },
    [defaultFileView, onOpenFileView],
  )

  const onOpenGitDiff = useCallback(
    (path: string, section: GitDiffSection) => {
      const currentTabs = tabsRef.current
      const id = gitDiffTabId(section, path)
      const nextTabs = currentTabs.some((tab) => getWorkspaceTabId(tab) === id)
        ? currentTabs
        : [...currentTabs, createGitDiffTab(path, section)]
      if (nextTabs !== currentTabs) {
        setTabs(nextTabs)
      }
      if (activeTabIdRef.current !== id) {
        setActiveTabId(id)
      }
      if (inspectedPathRef.current !== path) {
        setInspectedPath(path)
      }
      navigateIfNeeded(locationPathnameRef.current, pathToGitDiffRoute(section, path), navigate)
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setInspectedPath,
      setTabs,
      tabsRef,
    ],
  )

  const onOpenWorkspaceGraph = useCallback(() => {
    const currentTabs = tabsRef.current
    const id = workspaceGraphTabId()
    const nextTabs = currentTabs.some((tab) => getWorkspaceTabId(tab) === id)
      ? currentTabs
      : [...currentTabs, createWorkspaceGraphTab()]
    if (nextTabs !== currentTabs) {
      setTabs(nextTabs)
    }
    setActiveTabId(id)
    navigateIfNeeded(locationPathnameRef.current, pathToWorkspaceGraphRoute(), navigate)
  }, [locationPathnameRef, navigate, setActiveTabId, setTabs, tabsRef])

  const onCloseTab = useCallback(
    (tabId: string) => {
      const currentTabs = tabsRef.current
      const closedIndex = currentTabs.findIndex((tab) => getWorkspaceTabId(tab) === tabId)
      const closedTab = currentTabs.find((tab) => getWorkspaceTabId(tab) === tabId)
      const nextTabs = currentTabs.filter((tab) => getWorkspaceTabId(tab) !== tabId)
      setTabs(nextTabs)
      const closedPath =
        closedTab?.kind === 'file' || closedTab?.kind === 'git-diff' ? closedTab.path : null
      if (closedPath && inspectedPathRef.current === closedPath) {
        setInspectedPath(
          nextTabs.find((tab) => tab.kind === 'file' || tab.kind === 'git-diff')?.path ?? null,
        )
      }
      if (activeTabIdRef.current !== tabId) return

      const nextActive = nextTabs[Math.max(0, closedIndex - 1)] ?? nextTabs[0] ?? null
      const nextActiveId = nextActive ? getWorkspaceTabId(nextActive) : null
      setActiveTabId(nextActiveId)
      navigateToTab(nextActive, locationPathnameRef.current, navigate)
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      setActiveTabId,
      setInspectedPath,
      setTabs,
      tabsRef,
    ],
  )

  const onOpenTab = useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find((item) => getWorkspaceTabId(item) === tabId)
      if (!tab) return
      if (tab.kind === 'file') {
        onOpenFileView(tab.path, tab.view)
        return
      }
      if (tab.kind === 'workspace-graph') {
        if (activeTabIdRef.current !== tabId) {
          setActiveTabId(tabId)
        }
        navigateIfNeeded(locationPathnameRef.current, pathToWorkspaceGraphRoute(), navigate)
        return
      }
      if (activeTabIdRef.current !== tabId) {
        setActiveTabId(tabId)
      }
      if (inspectedPathRef.current !== tab.path) {
        setInspectedPath(tab.path)
      }
      navigateIfNeeded(
        locationPathnameRef.current,
        pathToGitDiffRoute(tab.section, tab.path),
        navigate,
      )
    },
    [
      activeTabIdRef,
      inspectedPathRef,
      locationPathnameRef,
      navigate,
      onOpenFileView,
      setActiveTabId,
      setInspectedPath,
      tabsRef,
    ],
  )

  const onCloseActiveTab = useCallback(() => {
    const currentActiveTabId = activeTabIdRef.current
    if (currentActiveTabId) onCloseTab(currentActiveTabId)
  }, [activeTabIdRef, onCloseTab])

  return {
    setViewMode,
    onOpenFile,
    onOpenFileView,
    onOpenGitDiff,
    onOpenWorkspaceGraph,
    onOpenTab,
    onCloseTab,
    onCloseActiveTab,
  }
}

const navigateIfNeeded = (
  currentPathname: string,
  nextRoute: string,
  navigate: NavigateFunction,
) => {
  if (currentPathname === nextRoute) return
  startTransition(() => {
    navigate(nextRoute)
  })
}

const navigateToTab = (
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

const openFileView = ({
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
