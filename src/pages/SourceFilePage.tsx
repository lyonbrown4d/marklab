import { useParams } from 'react-router-dom'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import SourceCodePage from '@/pages/SourceCodePage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

const SourceFilePage = () => {
  const params = useParams()
  const context = useLayoutContext()
  const { t } = useI18n()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (context.loadingPaths[requestedPath]) {
    return <EditorPaneFallback label={t('editor.loadingDocument')} path={requestedPath} />
  }

  return (
    <SourceCodePage
      activePath={requestedPath}
      value={context.editorValue}
      files={context.files}
      fileContents={context.fileContents}
      workspaceIndex={context.workspaceIndex}
      onChange={context.onEditorChange}
      onOpenFileView={context.onOpenFileView}
      showStatusBar={context.showEditorStatusBar}
    />
  )
}

export default SourceFilePage
