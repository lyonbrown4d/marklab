import { useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import GraphViewPage from '@/pages/GraphViewPage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { WorkspaceMapState } from '@/pages/workspace-map/WorkspaceMapState'

const FileGraphPage = () => {
  const params = useParams()
  const requestedPath = params['*'] || null
  const context = useLayoutContext(
    useShallow((state) => ({
      editorReadOnlyMode: state.editorReadOnlyMode,
      fileContent: requestedPath ? state.fileContents[requestedPath] : undefined,
      files: state.files,
      graph: state.graph,
      graphContentMode: state.graphContentMode,
      graphError: state.graphError,
      graphLoading: state.graphLoading,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
      graphRetry: state.graphRetry,
      loading: requestedPath ? state.loadingPaths[requestedPath] : undefined,
      onEditorChange: state.onEditorChange,
      onOpenFile: state.onOpenFile,
    })),
  )
  const { t } = useI18n()

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (context.loading || context.graphLoading) {
    return <EditorPaneFallback label={t('editor.loadingDocument')} path={requestedPath} />
  }

  if (context.graphError && context.graph.nodes.length === 0) {
    return (
      <WorkspaceMapState
        label={t('editor.loadFailed')}
        actionLabel={t('actions.retry')}
        onAction={() => void context.graphRetry()}
      />
    )
  }

  return (
    <GraphViewPage
      presentation="mindmap"
      graph={context.graph}
      markdown={context.fileContent ?? ''}
      onOpenFile={context.onOpenFile}
      onChange={context.onEditorChange}
      showMiniMap={context.graphMiniMapEnabled}
      contentMode={context.graphContentMode}
      editable={!context.editorReadOnlyMode}
      showEmptyMessage={false}
    />
  )
}

export default FileGraphPage
