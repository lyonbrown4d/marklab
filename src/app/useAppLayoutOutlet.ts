import { useMemo } from 'react'
import { useLocation, useOutlet } from 'react-router-dom'
import type { FileViewKind } from '@/store/appTypes'
import type { LayoutContext } from '@/app/AppLayoutContext'
import type { useAppLayoutState } from '@/app/useAppLayoutState'

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
      onEditorChange: state.onEditorChange,
      onOpenFile,
      onOpenFileView,
      theme: state.theme,
      setTheme: state.setTheme,
      files: state.files,
      fileContents: state.fileContents,
      workspaceIndex: state.workspaceIndex,
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
      onCloseActiveTab: state.onCloseActiveTab,
      onOpenProject: state.onOpenProject,
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
    state.graphContentMode,
    state.graphLoading,
    state.graphMiniMapEnabled,
    state.loadingPaths,
    state.onCloseActiveTab,
    state.onEditorChange,
    state.onOpenProject,
    state.recentProjects,
    state.rootKind,
    state.rootPath,
    state.saveStates,
    state.setTheme,
    state.showEditorStatusBar,
    state.theme,
    state.viewMode,
    state.workspaceIndex,
  ])
  const outlet = useOutlet(outletContext)
  const routeCacheKey = useMemo(
    () => `${state.rootKind}:${state.rootPath}:${location.pathname}`,
    [location.pathname, state.rootKind, state.rootPath],
  )
  const routeCacheMax = useMemo(
    () => Math.min(24, Math.max(8, state.tabs.length + 2)),
    [state.tabs.length],
  )

  return {
    outlet,
    routeCacheKey,
    routeCacheMax,
    totalFiles,
  }
}
