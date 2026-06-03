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
import type { FileViewKind, GitDiffSection, WorkspaceTab } from '@/store/useAppStore'

type LatestRef<T> = {
  current: T
}

type UseRouteTabSyncArgs = {
  activeTabId: string | null
  gitDiffMatch: unknown
  sourceMatch: unknown
  graphFileMatch: unknown
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
  setTabs: (tabs: WorkspaceTab[]) => void
  setActiveTabId: (id: string | null) => void
  setInspectedPath: (path: string | null) => void
}

export const useRouteTabSync = ({
  activeTabId,
  gitDiffMatch,
  sourceMatch,
  graphFileMatch,
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
  setTabs,
  setActiveTabId,
  setInspectedPath,
}: UseRouteTabSyncArgs) => {
  useEffect(() => {
    if (locationPathname !== '/') return
    if (gitDiffMatch || sourceMatch || graphFileMatch || graphWorkspaceMatch || isRouteFile) return
    if (lastHandledRouteRef.current !== locationPathname) {
      lastHandledRouteRef.current = locationPathname
    }
    if (!activeTabId && !inspectedPathRef.current) return

    setActiveTabId(null)
    setInspectedPath(null)
  }, [
    activeTabId,
    gitDiffMatch,
    graphFileMatch,
    graphWorkspaceMatch,
    inspectedPathRef,
    isRouteFile,
    lastHandledRouteRef,
    locationPathname,
    setActiveTabId,
    setInspectedPath,
    sourceMatch,
  ])

  useEffect(() => {
    if (!gitDiffMatch) return
    if (!isGitDiffSection(gitDiffSection) || !gitDiffPath) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname

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
    gitDiffMatch,
    gitDiffPath,
    gitDiffSection,
    inspectedPathRef,
    lastHandledRouteRef,
    locationPathname,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    tabsRef,
  ])

  useEffect(() => {
    if (!sourceMatch && !graphFileMatch && !graphWorkspaceMatch) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname

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
    graphFileMatch,
    graphWorkspaceMatch,
    inspectedPathRef,
    lastHandledRouteRef,
    locationPathname,
    routeFileView,
    routeFilePath,
    setActiveTabId,
    setInspectedPath,
    setTabs,
    sourceMatch,
    tabsRef,
  ])

  useEffect(() => {
    if (!isRouteFile) return
    if (!routePath) return
    if (lastHandledRouteRef.current === locationPathname) return
    lastHandledRouteRef.current = locationPathname

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
    inspectedPathRef,
    isRouteFile,
    lastHandledRouteRef,
    locationPathname,
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
