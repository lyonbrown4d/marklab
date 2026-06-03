import { useEffect, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ViewMode } from '@/store/useAppStore'
import { buildFileTree } from '@/logic/fileTree'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useGraphData } from '@/app/useGraphData'
import { fsApi, fsSnapshotSchema } from '@/services/fsApi'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'
import { useLayoutStoreSlice, useWorkspaceStoreSlice } from '@/store/selectors'
import { getWorkspaceTabId } from '@/logic/tabs'
import { useEditorRoutes } from '@/app/useEditorRoutes'
import { useRouteTabSync } from '@/app/useRouteTabSync'
import { useWorkspaceTabActions } from '@/app/useWorkspaceTabActions'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { appApi } from '@/services/appApi'

export const useAppLayoutState = () => {
  const {
    rootPath,
    rootKind,
    recentProjects,
    entries,
    tabs,
    activeTabId,
    hasHydrated,
    setRootPath,
    setRootKind,
    setEntries,
    setTabs,
    setActiveTabId,
    touchRecentProject,
  } = useWorkspaceStoreSlice()
  const {
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    silentSave,
    showEditorStatusBar,
    defaultFileView,
    graphMiniMapEnabled,
    graphContentMode,
    shortcutOverrides,
    toggleSidebar,
    toggleRightSidebar,
    setTheme,
  } = useLayoutStoreSlice()

  const [isMaximized, setIsMaximized] = useState(false)
  const [tabViewModes, setTabViewModes] = useState<Record<string, ViewMode>>({})
  const [inspectedPath, setInspectedPath] = useState<string | null>(null)
  const [sessionRestored, setSessionRestored] = useState(false)
  const [hasHandledRoute, setHasHandledRoute] = useState(false)

  const location = useLocation()
  const navigate = useNavigate()
  const lastHandledRouteRef = useRef<string | null>(null)
  const sessionRestoreStartedRef = useRef(false)

  const activeTab = useMemo(
    () => tabs.find((tab) => getWorkspaceTabId(tab) === activeTabId) ?? null,
    [activeTabId, tabs],
  )
  const {
    gitDiffMatch,
    sourceMatch,
    graphFileMatch,
    graphWorkspaceMatch,
    gitDiffSection,
    gitDiffPath,
    routeFileView,
    routeFilePath,
    routePath,
    internalRouteActive,
    isRouteFile,
    currentFilePath,
    activeResourcePath,
    viewMode,
  } = useEditorRoutes({ entries, activeTab, tabViewModes })
  const activeTabIdRef = useLatest(activeTabId)
  const currentFilePathRef = useLatest(currentFilePath)
  const inspectedPathRef = useLatest(inspectedPath)
  const locationPathnameRef = useLatest(location.pathname)
  const tabsRef = useLatest(tabs)
  const {
    setViewMode,
    onOpenFile,
    onOpenFileView,
    onOpenGitDiff,
    onOpenWorkspaceGraph,
    onOpenTab,
    onCloseTab,
    onCloseActiveTab,
  } = useWorkspaceTabActions({
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
  })

  const workspaceKey = `${rootKind}:${rootPath}`
  const routeSyncEnabled =
    sessionRestored &&
    (location.pathname !== '/' || !activeTabId || tabs.length === 0 || hasHandledRoute)
  const markRouteHandled = useCallback(() => setHasHandledRoute(true), [])
  const { fileContents, editorValue, dirtyPaths, loadingPaths, saveStates, onEditorChange } =
    useEditorBuffer({
      activePath: currentFilePath,
      workspaceKey,
    })

  const {
    loadWorkspace,
    onSelectFolder,
    onSelectSingleFile,
    onUseInternalRoot,
    openFolder,
    createFile,
    createFolder,
    renamePath,
    movePath,
    deletePath,
  } = useProjectLoader({
    rootPath,
    rootKind,
    entries,
    tabs,
    activeTabId,
    locationPathname: location.pathname,
    preserveCurrentRoute: internalRouteActive,
    defaultFileView,
    navigate,
    setEntries,
    setRootPath,
    setRootKind,
    setTabs,
    setActiveTabId,
    touchRecentProject,
  })

  useEffect(() => {
    if (!hasHydrated || sessionRestoreStartedRef.current) return
    sessionRestoreStartedRef.current = true

    let cancelled = false
    const restoreSession = async () => {
      try {
        if (isDesktopRuntime() && rootPath) {
          try {
            if (rootKind === 'single') {
              await fsApi.setSingleFile(rootPath)
            } else if (rootKind === 'external') {
              await fsApi.setRoot(rootPath)
            }
          } catch (error) {
            console.warn('Failed to restore persisted workspace root.', error)
          }
        }
        await loadWorkspace()
      } catch (error) {
        console.warn('Failed to restore workspace session.', error)
      } finally {
        if (!cancelled) setSessionRestored(true)
      }
    }

    void restoreSession()
    return () => {
      cancelled = true
    }
  }, [hasHydrated, loadWorkspace, rootKind, rootPath])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    const openArgs = (args: string[]) => {
      const paths = args.filter((arg) => arg && !arg.startsWith('-') && !arg.startsWith('marklab:'))
      for (const path of paths) void openFolder(path)
    }

    let unlistenSingleInstance: (() => void) | undefined
    void appApi.getLaunchInfo().then((info) => {
      openArgs(info.args)
    })
    void listen<{ args: string[]; cwd: string }>('single-instance', (event) => {
      openArgs(event.payload.args)
    }).then((fn) => {
      unlistenSingleInstance = fn
    })

    return () => {
      if (unlistenSingleInstance) unlistenSingleInstance()
    }
  }, [openFolder])

  useEffect(() => {
    if (!isDesktopRuntime()) return

    let unlisten: (() => void) | undefined
    const setup = async () => {
      unlisten = await listen<unknown>('fs-changed', (event) => {
        const parsed = fsSnapshotSchema.safeParse(event.payload)
        if (!parsed.success) return
        void loadWorkspace({
          snapshot: parsed.data,
        })
      })
    }
    void setup()
    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [loadWorkspace])

  useRouteTabSync({
    activeTabId,
    enabled: routeSyncEnabled,
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
    locationPathname: location.pathname,
    lastHandledRouteRef,
    inspectedPathRef,
    tabsRef,
    onRouteHandled: markRouteHandled,
    setTabs,
    setActiveTabId,
    setInspectedPath,
  })

  const fileTree = useMemo(() => buildFileTree(entries), [entries])
  const workspaceIndex = useWorkspaceIndex(
    entries,
    entries.some((entry) => entry.kind === 'file'),
  )
  const graphMode = graphWorkspaceMatch ? 'workspace' : graphFileMatch ? 'file' : null
  const graphState = useGraphData(graphMode, workspaceIndex, currentFilePath, graphContentMode)

  return {
    rootPath,
    rootKind,
    recentProjects,
    files: entries,
    fileContents,
    tabs,
    activeTab,
    activeTabId,
    dirtyPaths,
    loadingPaths,
    saveStates,
    activePath: currentFilePath,
    activeResourcePath,
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    silentSave,
    showEditorStatusBar,
    defaultFileView,
    graphMiniMapEnabled,
    graphContentMode,
    shortcutOverrides,
    viewMode,
    fileTree,
    graph: graphState.graph,
    graphLoading: graphState.loading,
    workspaceIndex,
    inspectedPath: inspectedPath ?? activeResourcePath,
    editorValue,
    isMaximized,
    setIsMaximized,
    onEditorChange,
    onOpenFile,
    onOpenFileView,
    onOpenGitDiff,
    onOpenWorkspaceGraph,
    onOpenTab,
    onCloseTab,
    onCloseActiveTab,
    onSelectProject: onSelectFolder,
    onSelectSingleFile,
    onOpenProject: openFolder,
    onUseInternalRoot,
    createFile,
    createFolder,
    renamePath,
    movePath,
    deletePath,
    onRefresh: loadWorkspace,
    onInspectPath: setInspectedPath,
    setTheme,
    setViewMode,
    toggleSidebar,
    toggleRightSidebar,
  }
}
