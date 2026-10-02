import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { nextEditorLoadRouteState } from '@/app/useEditorBuffer'
import { resolveEditorLoadState } from '@/app/useEditorBufferState'
import { Button } from '@/components/ui/button'
import { useWorkspaceMapEditorRoute } from '@/app/useWorkspaceMapEditorRoute'
import { useI18n } from '@/i18n/useI18n'
import { buildWorkspaceMapGraph } from '@/logic/workspaceMapGraph'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { WorkspaceMapCanvas } from '@/pages/workspace-map/WorkspaceMapCanvas'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'

const WorkspaceGraphPage = () => {
  const context = useLayoutContext(
    useShallow((state) => ({
      editorReadOnlyMode: state.editorReadOnlyMode,
      fileContents: state.fileContents,
      files: state.files,
      graph: state.graph,
      graphEditorPath: state.graphEditorPath,
      graphError: state.graphError,
      graphLoading: state.graphLoading,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      graphRefreshing: state.graphRefreshing,
      graphRetry: state.graphRetry,
      loadingPaths: state.loadingPaths,
      onEditorChange: state.onEditorChange,
      onOpenFile: state.onOpenFile,
      saveStates: state.saveStates,
    })),
  )
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useI18n()
  const mapGraph = useMemo(() => buildWorkspaceMapGraph(context.graph), [context.graph])
  const { openEditor, closeEditor } = useWorkspaceMapEditorRoute({
    enabled: true,
    entries: context.files,
  })
  const editorLoadState = context.graphEditorPath
    ? resolveEditorLoadState({
        fileContents: context.fileContents,
        loadingPaths: context.loadingPaths,
        path: context.graphEditorPath,
        saveStates: context.saveStates,
      })
    : ({ status: 'loading' } as const)
  const retryEditorLoad = useCallback(() => {
    navigate(
      {
        hash: location.hash,
        pathname: location.pathname,
        search: location.search,
      },
      {
        replace: true,
        state: nextEditorLoadRouteState(location.state),
      },
    )
  }, [location.hash, location.pathname, location.search, location.state, navigate])

  if (context.graphLoading) {
    return <WorkspaceMapState label={t('workspaceMap.loadingDocument')} loading />
  }

  if (context.graphError && mapGraph.nodes.length === 0) {
    return (
      <WorkspaceMapState
        label={t('workspaceMap.loadFailed')}
        actionLabel={t('workspaceMap.retry')}
        onAction={() => void context.graphRetry()}
      />
    )
  }

  if (mapGraph.nodes.length === 0) {
    return <WorkspaceMapState label={t('workspaceMap.empty')} />
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1">
        <WorkspaceMapCanvas
          activePath={context.graphEditorPath}
          editorLoadState={editorLoadState}
          graph={mapGraph}
          onActivateEditor={openEditor}
          onChange={context.onEditorChange}
          onCloseEditor={closeEditor}
          onOpenFile={context.onOpenFile}
          onRetryEditor={retryEditorLoad}
          readOnly={context.editorReadOnlyMode}
          showMiniMap={context.graphMiniMapEnabled}
        />
      </div>
      {context.graphError ? (
        <div
          className="absolute right-3 top-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-card/95 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur"
          role="alert"
        >
          <span>{t('workspaceMap.loadFailed')}</span>
          <Button onClick={() => void context.graphRetry()} size="sm" variant="ghost">
            {t('workspaceMap.retry')}
          </Button>
        </div>
      ) : context.graphRefreshing ? (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-border/70 bg-card/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
          {t('workspaceMap.refreshing')}
        </div>
      ) : null}
    </div>
  )
}

export default WorkspaceGraphPage
