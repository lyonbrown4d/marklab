import { useParams } from 'react-router-dom'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import GraphViewPage from '@/pages/GraphViewPage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

const FileGraphPage = () => {
  const params = useParams()
  const context = useLayoutContext()
  const { t } = useI18n()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (context.loadingPaths[requestedPath] || context.graphLoading) {
    return <EditorPaneFallback label={t('editor.loadingDocument')} path={requestedPath} />
  }

  return (
    <GraphViewPage
      graph={context.graph}
      markdown={context.editorValue}
      onOpenFile={context.onOpenFile}
      onChange={context.onEditorChange}
      showMiniMap={context.graphMiniMapEnabled}
      contentMode={context.graphContentMode}
      editable
      showEmptyMessage={false}
    />
  )
}

export default FileGraphPage
