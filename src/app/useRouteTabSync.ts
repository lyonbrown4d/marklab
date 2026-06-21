import { useEffect } from 'react'
import { isGitDiffSection } from '@/logic/routing'
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
import type { FileViewKind, GitDiffSection, WorkspaceTab } from '@/store/appTypes'

type LatestRef<T> = {
  current: T
}

type UseRouteTabSyncArgs = {
  activeTabId: string | null
  enabled: boolean
  gitDiffMatch: unknown
  sourceMatch: unknown
  graphFileMatch: unknown
  previewMatch: unknown
  graphWorkspaceMatch: unknown
  gitDiffSection: string | undefined
  gitDiffPath: string | null
  routeFileView: FileViewKind | null
  routeFilePath: string | null
  routePath: string | null
  isRouteFile: boolean
  locationPathname: string
  lastHandledRouteRef: LatestRef<string | null>
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  onRouteHandled: () => void
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

export const useRouteTabSync = ({
  activeTabId,
  enabled,
  gitDiffMatch,
  sourceMatch,
  graphFileMatch,
  previewMatch,
  graphWorkspaceMatch,
  gitDiffSection,
  gitDiffPath,
  routeFileView,
  routeFilePath,
  routePath,
  isRouteFile,
  locationPathname,
  lastHandledRouteRef,
  inspectedPathRef,
  tabsRef,
  onRouteHandled,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: UseRouteTabSyncArgs) => {
  useEffect(() => {
    if (!enabled) return
    if (locationPathname !== '/') return
    if (
      gitDiffMatch ||
      sourceMatch ||
      graphFileMatch ||
      previewMatch ||
      graphWorkspaceMatch ||
      isRouteFile
    ) {
      return
    }
    if (lastHandledRouteRef.current !== locationPathname) {
      lastHandledRouteRef.current = locationPathname
      onRouteHandled()
    }
    if (!activeTabId && !inspectedPathRef.current) return

    setActiveTabId(null)
    setInspectedPath(null)
  }, [
    activeTabId,
    enabled,
    gitDiffMatch,
    graphFileMatch,
    graphWorkspaceMatch,
    previewMatch,
    inspectedPathRef,
    isRouteFile,
    lastHandledRouteRef,
    locationPathname,
    onRouteHandled,
    setActiveTabId,
    setInspectedPath,
    sourceMatch,
  ])

  useEffect(() => {
    if (!enabled) return
    if (!gitDiffMatch) return
    if (!isGitDiffSection(gitDiffSection) || !gitDiffPath) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname
    onRouteHandled()

    openRouteGitDiff({
      path: gitDiffPath,
      section: gitDiffSection,
      inspectedPathRef,
      tabsRef,
      setTabs,
      setActiveTabId,
      setInspectedPath,
    })
  }, [
    enabled,
    gitDiffMatch,
    gitDiffPath,
    gitDiffSection,
    inspectedPathRef,
    lastHandledRouteRef,
    locationPathname,
    onRouteHandled,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    tabsRef,
  ])

  useEffect(() => {
    if (!enabled) return
    if (!sourceMatch && !graphFileMatch && !previewMatch && !graphWorkspaceMatch) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname
    onRouteHandled()

    if (graphWorkspaceMatch) {
      openRouteWorkspaceGraph({
        tabsRef,
        setTabs,
        setActiveTabId,
      })
      return
    }
    if (!routeFilePath || !routeFileView) return

    openRouteFile({
      path: routeFilePath,
      view: routeFileView,
      inspect: true,
      inspectedPathRef,
      tabsRef,
      setTabs,
      setActiveTabId,
      setInspectedPath,
    })
  }, [
    enabled,
    graphFileMatch,
    graphWorkspaceMatch,
    previewMatch,
    inspectedPathRef,
    lastHandledRouteRef,
    locationPathname,
    onRouteHandled,
    routeFileView,
    routeFilePath,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    sourceMatch,
    tabsRef,
  ])

  useEffect(() => {
    if (!enabled) return
    if (!isRouteFile) return
    if (!routePath) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname
    onRouteHandled()

    openRouteFile({
      path: routePath,
      view: 'edit',
      inspect: false,
      inspectedPathRef,
      tabsRef,
      setTabs,
      setActiveTabId,
      setInspectedPath,
    })
  }, [
    enabled,
    inspectedPathRef,
    isRouteFile,
    lastHandledRouteRef,
    locationPathname,
    onRouteHandled,
    routePath,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    tabsRef,
  ])
}

type OpenRouteFileArgs = {
  path: string
  view: FileViewKind
  inspect: boolean
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

const openRouteFile = ({
  path,
  view,
  inspect,
  inspectedPathRef,
  tabsRef,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: OpenRouteFileArgs) => {
  const id = view === 'edit' ? fileTabId(path) : fileViewTabId(path, view)
  const currentTabs = tabsRef.current
  if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
    setTabs([...currentTabs, createFileTab(path, view)])
  }
  setActiveTabId(id)
  if (inspect && inspectedPathRef.current !== path) {
    setInspectedPath(path)
  }
}

type OpenRouteWorkspaceGraphArgs = {
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
}

const openRouteWorkspaceGraph = ({
  tabsRef,
  setTabs,
  setActiveTabId,
}: OpenRouteWorkspaceGraphArgs) => {
  const id = workspaceGraphTabId()
  const currentTabs = tabsRef.current
  if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
    setTabs([...currentTabs, createWorkspaceGraphTab()])
  }
  setActiveTabId(id)
}

type OpenRouteGitDiffArgs = {
  path: string
  section: GitDiffSection
  inspectedPathRef: LatestRef<string | null>
  tabsRef: LatestRef<WorkspaceTab[]>
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

const openRouteGitDiff = ({
  path,
  section,
  inspectedPathRef,
  tabsRef,
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: OpenRouteGitDiffArgs) => {
  const id = gitDiffTabId(section, path)
  const currentTabs = tabsRef.current
  if (!currentTabs.some((tab) => getWorkspaceTabId(tab) === id)) {
    setTabs([...currentTabs, createGitDiffTab(path, section)])
  }
  setActiveTabId(id)
  if (inspectedPathRef.current !== path) {
    setInspectedPath(path)
  }
}
