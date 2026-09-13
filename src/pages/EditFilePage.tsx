import { lazy, Suspense } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { nextEditorLoadRouteState } from '@/app/useEditorBuffer'
import { resolveEditorLoadState } from '@/app/useEditorBufferState'
import { Button } from '@/components/ui/button'
import EditorEmptyState from '@/pages/EditorEmptyState'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { isCalendarFilePath } from '@/logic/ics'
import { isTextFileViewPath } from '@/logic/fileTypes'
import { pathToRoute } from '@/logic/routing'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { useLayoutContext } from '@/pages/useLayoutContext'

const WysiwygEditorPage = lazy(() => import('@/pages/WysiwygEditorPage'))
const CalendarFilePage = lazy(() => import('@/pages/CalendarFilePage'))

const EditFilePage = () => {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
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

  if (!isTextFileViewPath(activePath)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div
          className="w-full max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-5"
          role="alert"
        >
          <p className="text-sm font-semibold text-foreground">
            {t('preview.inlineReadonly', { path: activePath })}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={activePath}>
            {activePath}
          </p>
        </div>
      </div>
    )
  }
  const loadState = resolveEditorLoadState({
    fileContents: context.fileContents,
    loadingPaths: context.loadingPaths,
    path: activePath,
    saveStates: context.saveStates,
  })

  if (loadState.status === 'loading') {
    return <EditorPaneFallback label={t('editor.loadingDocument')} path={activePath} />
  }

  if (loadState.status === 'error') {
    const retryDocumentLoad = () => {
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
    }

    return (
      <div className="flex h-full items-center justify-center p-6">
        <div
          className="w-full max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-5"
          role="alert"
        >
          <p className="text-sm font-semibold text-foreground">{t('editor.openFileFailed')}</p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={activePath}>
            {activePath}
          </p>
          {loadState.message ? (
            <p className="mt-3 break-words text-sm text-muted-foreground">{loadState.message}</p>
          ) : null}
          <Button className="mt-4" onClick={retryDocumentLoad} size="sm" variant="outline">
            {t('app.restoreRetry')}
          </Button>
        </div>
      </div>
    )
  }

  const fallback = <EditorPaneFallback label={t('editor.loadingDocument')} path={activePath} />

  if (isCalendarFilePath(activePath)) {
    return (
      <Suspense fallback={fallback}>
        <CalendarFilePage
          activePath={activePath}
          value={loadState.content}
          onOpenSource={() => context.onOpenFileView(activePath, 'source')}
          showStatusBar={context.showEditorStatusBar}
        />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={fallback}>
      <WysiwygEditorPage
        activePath={activePath}
        value={loadState.content}
        onChange={context.onEditorChange}
        files={context.files}
        showStatusBar={context.showEditorStatusBar}
      />
    </Suspense>
  )
}

export default EditFilePage
