import { useCallback, useMemo, useRef, useState } from 'react'
import { useLatest } from 'ahooks'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ViewMode } from '@/store/appTypes'
import { useProjectLoader } from '@/app/useProjectLoader'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { useLayoutStoreSlice, useWorkspaceStoreSlice } from '@/store/selectors'
import { getWorkspaceTabId } from '@/logic/tabs'
import { useEditorRoutes } from '@/app/useEditorRoutes'
import { useRouteTabSync } from '@/app/useRouteTabSync'
import { useWorkspaceTabActions } from '@/app/useWorkspaceTabActions'
import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import { isTextFileViewPath } from '@/logic/fileTypes'
import { useWorkspaceWindowActions } from '@/components/titlebar/useWorkspaceWindowActions'
import { useMarkdownFileDrop } from '@/app/useMarkdownFileDrop'
import { useWorkspaceMapEditorRoute } from '@/app/useWorkspaceMapEditorRoute'
import { getWorkspaceFilesTarget } from '@/logic/workspaceFilesTarget'
import { useAppLayoutGraphState } from '@/app/useAppLayoutGraphState'

export const useAppLayoutState = () => {
  const workspaceWindowActions = useWorkspaceWindowActions()
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
    editorReadOnlyMode,
    shortcutOverrides,
    toggleSidebar,
    toggleRightSidebar,
    setTheme,
    setEditorReadOnlyMode,
    setShowEditorStatusBar,
  } = useLayoutStoreSlice()

  const [isMaximized, setIsMaximized] = useState(false)
  const [tabViewModes, setTabViewModes] = useState<Record<string, ViewMode>>({})
  const [inspectedPath, setInspectedPath] = useState<string | null>(null)
  const [hasHandledRoute, setHasHandledRoute] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const lastHandledRouteRef = useRef<string | null>(null)
  const activeTab = useMemo(
    () => tabs.find((tab) => getWorkspaceTabId(tab) === activeTabId) ?? null,
    [activeTabId, tabs],
  )
  const {
    gitDiffMatch,
    sourceMatch,
    previewMatch,
    graphWorkspaceMatch,
    allPagesMatch,
    webMatch,
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
    workspaceView,
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
    onOpenAllPages,
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
  const markRouteHandled = useCallback(() => setHasHandledRoute(true), [])
  const { editorPath: graphEditorPath } = useWorkspaceMapEditorRoute({
    enabled: Boolean(graphWorkspaceMatch),
    entries,
  })
  const editorBufferPath =
    graphEditorPath ??
    (currentFilePath && isTextFileViewPath(currentFilePath) ? currentFilePath : null)
  const {
    fileContents,
    editorValue,
    dirtyPaths,
    loadingPaths,
    saveStates,
    onEditorChange,
    onPersistedContentChange,
  } = useEditorBuffer({
    activePath: editorBufferPath,
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
  useMarkdownFileDrop(openFolder)
  const { isSessionRestored, restoreStatusMessage, isRestoringSession, restoreWorkspaceSession } =
    useWorkspaceRestore({
      hasHydrated,
      rootPath,
      rootKind,
      loadWorkspace,
    })
  const onOpenWorkspaceFiles = useCallback(() => {
    const target = getWorkspaceFilesTarget(
      tabsRef.current,
      entries,
      activeTabIdRef.current,
      defaultFileView,
    )
    if (target) onOpenFileView(target.path, target.view)
  }, [activeTabIdRef, defaultFileView, entries, onOpenFileView, tabsRef])

  const routeSyncEnabled =
    isSessionRestored &&
    (location.pathname !== '/' || !activeTabId || tabs.length === 0 || hasHandledRoute)

  useRouteTabSync({
    enabled: routeSyncEnabled,
    gitDiffMatch,
    sourceMatch,
    previewMatch,
    graphWorkspaceMatch,
    allPagesMatch,
    webMatch,
    webTabRouteId: webMatch?.params.tabId,
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
  const graphState = useAppLayoutGraphState({
    entries,
    graphContentMode,
    graphWorkspace: Boolean(graphWorkspaceMatch),
    workspaceKey,
  })

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
    editorBufferPath,
    graphEditorPath,
    activeResourcePath,
    sidebarCollapsed,
    rightSidebarCollapsed,
    theme,
    silentSave,
    showEditorStatusBar,
    defaultFileView,
    graphMiniMapEnabled,
    graphContentMode,
    editorReadOnlyMode,
    shortcutOverrides,
    viewMode,
    workspaceView,
    ...graphState,
    workspaceKey,
    restoreStatusMessage,
    isRestoringSession,
    restoreSession: restoreWorkspaceSession,
    inspectedPath: inspectedPath ?? activeResourcePath,
    editorValue,
    isMaximized,
    setIsMaximized,
    onEditorChange,
    onPersistedContentChange,
    onOpenFile,
    onOpenFileView,
    onOpenGitDiff,
    onOpenWorkspaceGraph,
    onOpenAllPages,
    onOpenWorkspaceFiles,
    onOpenTab,
    onCloseTab,
    onCloseActiveTab,
    onSelectProject: onSelectFolder,
    onSelectSingleFile,
    onOpenProject: workspaceWindowActions.openWorkspacePathInNewWindow,
    onOpenProjectInCurrentWindow: openFolder,
    onOpenCurrentWorkspaceInNewWindow: workspaceWindowActions.openCurrentWorkspaceInNewWindow,
    onSelectWorkspaceInNewWindow: workspaceWindowActions.selectWorkspaceInNewWindow,
    workspaceWindowOpening: workspaceWindowActions.opening,
    onUseInternalRoot,
    createFile,
    createFolder,
    renamePath,
    movePath,
    deletePath,
    onRefresh: loadWorkspace,
    onInspectPath: setInspectedPath,
    setTheme,
    setEditorReadOnlyMode,
    setShowEditorStatusBar,
    setViewMode,
    toggleSidebar,
    toggleRightSidebar,
  }
}
