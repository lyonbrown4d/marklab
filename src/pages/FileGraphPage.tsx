import { useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import GraphViewPage from '@/pages/GraphViewPage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

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
      graphLoading: state.graphLoading,
      graphMiniMapEnabled: state.graphMiniMapEnabled,
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
