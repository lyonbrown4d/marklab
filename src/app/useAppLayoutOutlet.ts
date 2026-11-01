import { createElement, useMemo } from 'react'
import type { FileViewKind } from '@/store/appTypes'
import type { LayoutContext } from '@/app/AppLayoutContext'
import type { useAppLayoutState } from '@/app/useAppLayoutState'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { WorkspaceDockOutlet } from '@/features/workbench/WorkspaceDockOutlet'

type AppLayoutState = ReturnType<typeof useAppLayoutState>
type OutletState = Pick<
  AppLayoutState,
  | Exclude<keyof LayoutContext, 'currentView' | 'onOpenFile' | 'onOpenFileView'>
  | 'viewMode'
  | 'workspaceKey'
  | 'tabs'
  | 'isWorkspaceDataReady'
>

type UseAppLayoutOutletOptions = {
  immersiveZenMode: boolean
  onOpenFile: (path: string) => void
  onOpenFileView: (path: string, view: FileViewKind) => void
  state: OutletState
}

export const useAppLayoutOutlet = ({
  immersiveZenMode,
  onOpenFile,
  onOpenFileView,
  state,
}: UseAppLayoutOutletOptions) => {
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
      editorBufferPath: state.editorBufferPath,
      onEditorChange: state.onEditorChange,
      bindDocument: state.bindDocument,
      flushBuffers: state.flushBuffers,
      onOpenFile,
      onOpenFileView,
      theme: state.theme,
      setTheme: state.setTheme,
      files: state.files,
      fileContents: state.fileContents,
      saveStates: state.saveStates,
      loadingPaths: state.loadingPaths,
      currentView: state.viewMode,
      activeTab: state.activeTab,
      rootPath: state.rootPath,
      rootKind: state.rootKind,
      recentProjects: state.recentProjects,
      showEditorStatusBar: state.showEditorStatusBar && !immersiveZenMode,
      editorReadOnlyMode: state.editorReadOnlyMode,
      onCloseActiveTab: state.onCloseActiveTab,
      onCloseTab: state.onCloseTab,
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
    state.graphError,
    state.graphRefreshing,
    state.graphRetry,
    state.editorReadOnlyMode,
    state.graphLoading,
    state.editorBufferPath,
    state.loadingPaths,
    state.onCloseActiveTab,
    state.onCloseTab,
    state.onEditorChange,
    state.bindDocument,
    state.flushBuffers,
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
  ])
  const outlet = useMemo(
    () =>
      state.isWorkspaceDataReady
        ? createElement(WorkspaceDockOutlet, {
            context: outletContext,
            workspaceKey: state.workspaceKey,
            tabs: state.tabs,
            key: state.workspaceKey,
          })
        : createElement(EditorPaneFallback),
    [outletContext, state.tabs, state.workspaceKey, state.isWorkspaceDataReady],
  )

  return {
    outlet,
    totalFiles,
  }
}
