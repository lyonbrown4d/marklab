import { lazy, Suspense } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import EditorEmptyState from '@/pages/EditorEmptyState'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { pathToRoute } from '@/logic/routing'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

const WysiwygEditorPage = lazy(() => import('@/pages/WysiwygEditorPage'))

const EditFilePage = () => {
  const params = useParams()
  const context = useLayoutContext()
  const { t } = useI18n()
  const requestedPath = params['*'] || null
  const activePath = requestedPath ?? context.activePath

  if (!requestedPath && context.activePath) {
    return <Navigate to={pathToRoute(context.activePath)} replace />
  }

  if (requestedPath && !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (!activePath) {
    return (
      <EditorEmptyState
        files={context.files.filter((file) => file.kind === 'file')}
        onOpenFile={context.onOpenFile}
      />
    )
  }

  if (context.loadingPaths[activePath]) {
    return <EditorPaneFallback label={t('editor.loadingDocument')} path={activePath} />
  }

  const fallback = <EditorPaneFallback label={t('editor.loadingDocument')} path={activePath} />

  return (
    <Suspense fallback={fallback}>
      <WysiwygEditorPage
        activePath={activePath}
        value={context.editorValue}
        onChange={context.onEditorChange}
        showStatusBar={context.showEditorStatusBar}
      />
    </Suspense>
  )
}

export default EditFilePage
