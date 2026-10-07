import { createElement, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import type { FileViewKind } from '@/store/appTypes'
import type { LayoutContext } from '@/app/AppLayoutContext'
import type { useAppLayoutState } from '@/app/useAppLayoutState'
import { AppCachedOutlet } from '@/app/AppCachedOutlet'

type AppLayoutState = ReturnType<typeof useAppLayoutState>

type UseAppLayoutOutletOptions = {
  immersiveZenMode: boolean
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  state: AppLayoutState
}

export const useAppLayoutOutlet = ({
  immersiveZenMode,
  onOpenFile,
  onOpenFileView,
  state,
}: UseAppLayoutOutletOptions) => {
  const location = useLocation()
  const totalFiles = useMemo(
    () => state.files.reduce((count, file) => count + (file.kind === 'file' ? 1 : 0), 0),
    [state.files],
  )
  const outletContext = useMemo<LayoutContext>(() => {
    return {
      activePath: state.activePath,
      editorValue: state.editorValue,
      graph: state.graph,
      graphLoading: state.graphLoading,
      graphError: state.graphError,
      graphRetry: state.graphRetry,
      graphRefreshing: state.graphRefreshing,
      graphEditorPath: state.graphEditorPath,
      editorBufferPath: state.editorBufferPath,
      onEditorChange: state.onEditorChange,
      onOpenFile,
      onOpenFileView,
      theme: state.theme,
      setTheme: state.setTheme,
      files: state.files,
      fileContents: state.fileContents,
      workspaceIndex: state.workspaceIndex,
      workspaceIndexLoading: state.workspaceIndexLoading,
      workspaceIndexError: state.workspaceIndexError,
      onRetryWorkspaceIndex: state.onRetryWorkspaceIndex,
      saveStates: state.saveStates,
      loadingPaths: state.loadingPaths,
      currentView: state.viewMode,
      activeTab: state.activeTab,
      rootPath: state.rootPath,
      rootKind: state.rootKind,
      recentProjects: state.recentProjects,
      showEditorStatusBar: state.showEditorStatusBar && !immersiveZenMode,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      graphContentMode: state.graphContentMode,
      editorReadOnlyMode: state.editorReadOnlyMode,
      onCloseActiveTab: state.onCloseActiveTab,
      onOpenProject: state.onOpenProject,
      onOpenProjectInCurrentWindow: state.onOpenProjectInCurrentWindow,
    }
  }, [
    immersiveZenMode,
    onOpenFile,
    onOpenFileView,
    state.activePath,
    state.activeTab,
    state.editorValue,
    state.fileContents,
    state.files,
    state.graph,
    state.graphEditorPath,
    state.graphError,
    state.graphRefreshing,
    state.graphRetry,
    state.graphContentMode,
    state.editorReadOnlyMode,
    state.graphLoading,
    state.editorBufferPath,
    state.graphMiniMapEnabled,
    state.loadingPaths,
    state.onCloseActiveTab,
    state.onEditorChange,
    state.onOpenProject,
    state.onOpenProjectInCurrentWindow,
    state.recentProjects,
    state.rootKind,
    state.rootPath,
    state.saveStates,
    state.setTheme,
    state.showEditorStatusBar,
    state.theme,
    state.viewMode,
    state.workspaceIndex,
    state.workspaceIndexError,
    state.workspaceIndexLoading,
    state.onRetryWorkspaceIndex,
  ])
  const routeCacheKey = useMemo(
    () => `${state.rootKind}:${state.rootPath}:${location.pathname}`,
    [location.pathname, state.rootKind, state.rootPath],
  )
  const shouldAnimateRouteCache = state.viewMode !== 'wysiwyg'
  // Keep sidebar and terminal state changes outside the cached route subtree.
  // AppCachedOutlet still subscribes to router context for navigation updates.
  const outlet = useMemo(
    () =>
      createElement(AppCachedOutlet, {
        context: outletContext,
        routeCacheKey,
        routePathname: location.pathname,
        shouldAnimateRouteCache,
      }),
    [location.pathname, outletContext, routeCacheKey, shouldAnimateRouteCache],
  )

  return {
    outlet,
    totalFiles,
  }
}
