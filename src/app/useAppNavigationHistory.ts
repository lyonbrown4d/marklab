import { useCallback, useEffect, useMemo } from 'react'
import type { FsSearchResult } from '@/services/fsApi'
import type { FileViewKind, ViewMode } from '@/store/appTypes'
import { useNavigationHistory } from '@/features/navigation/useNavigationHistory'
import type { NavigationLocation } from '@/features/navigation/navigationHistory'
import {
  clearPendingSourcePositionNavigation,
  requestFocusSourcePosition,
} from '@/utils/editorNavigation'
import {
  clearPendingWorkspaceMapNavigation,
  requestWorkspaceMapNodeFocus,
} from '@/utils/workspaceMapNavigation'
import type { WorkspaceView } from '@/app/useEditorRoutes'

type UseAppNavigationHistoryOptions = {
  activePath: string | null
  viewMode: ViewMode
  workspaceView: WorkspaceView
  workspaceKey: string
  openFileView: (path: string, view: FileViewKind) => void
  openHeading: (path: string, slug: string) => void
  openSearchResult: (result: FsSearchResult) => void
  openWorkspaceGraph: () => void
}

type CurrentNavigationLocationOptions = Pick<
  UseAppNavigationHistoryOptions,
  'activePath' | 'viewMode' | 'workspaceView'
>

export const getCurrentNavigationLocation = ({
  activePath,
  viewMode,
  workspaceView,
}: CurrentNavigationLocationOptions): NavigationLocation | null => {
  if (workspaceView === 'map') return { kind: 'graph', nodeId: activePath ?? 'workspace' }
  if (!activePath) return null
  const view = viewMode === 'source' ? 'source' : viewMode === 'preview' ? 'preview' : 'edit'
  return { kind: 'file', path: activePath, view }
}

export const useAppNavigationHistory = ({
  activePath,
  viewMode,
  workspaceView,
  workspaceKey,
  openFileView,
  openHeading,
  openSearchResult,
  openWorkspaceGraph,
}: UseAppNavigationHistoryOptions) => {
  useEffect(() => {
    clearPendingSourcePositionNavigation()
    clearPendingWorkspaceMapNavigation()
  }, [workspaceKey])
  useEffect(() => {
    if (workspaceView !== 'map') clearPendingWorkspaceMapNavigation()
  }, [workspaceView])
  const currentLocation = useMemo(
    () => getCurrentNavigationLocation({ activePath, viewMode, workspaceView }),
    [activePath, viewMode, workspaceView],
  )
  const onOpenLocation = useCallback(
    (location: NavigationLocation) => {
      if (location.kind === 'graph') {
        clearPendingSourcePositionNavigation()
        requestWorkspaceMapNodeFocus({ ...location, workspaceKey })
        openWorkspaceGraph()
        return
      }
      clearPendingWorkspaceMapNavigation()
      if (location.kind === 'heading') return openHeading(location.path, location.slug)
      if (location.kind === 'source') {
        requestFocusSourcePosition({ ...location, workspaceKey })
        openFileView(location.path, 'source')
        return
      }
      clearPendingSourcePositionNavigation()
      openFileView(location.path, location.view)
    },
    [openFileView, openHeading, openWorkspaceGraph, workspaceKey],
  )
  const history = useNavigationHistory({
    workspaceKey,
    currentLocation,
    onNavigate: onOpenLocation,
  })
  const onOpenHeading = useCallback(
    (path: string, slug: string) => {
      history.visit({ kind: 'heading', path, slug })
      openHeading(path, slug)
    },
    [history, openHeading],
  )
  const onOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      history.visit({
        kind: 'source',
        path: result.path,
        line: result.line,
        column: result.column,
        endColumn: result.end_column,
      })
      openSearchResult(result)
    },
    [history, openSearchResult],
  )

  return {
    back: history.back,
    forward: history.forward,
    onOpenHeading,
    onOpenLocation,
    onOpenSearchResult,
    recentLocations: history.recentLocations,
  }
}
