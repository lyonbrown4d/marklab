import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { nextEditorLoadRouteState } from '@/app/useEditorBuffer'
import { resolveEditorLoadState } from '@/app/useEditorBufferState'
import { Button } from '@/components/ui/button'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import SourceCodePage from '@/pages/SourceCodePage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { isTextFileViewPath } from '@/logic/fileTypes'
import { useLayoutContext } from '@/pages/useLayoutContext'

const SourceFilePage = () => {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const context = useLayoutContext()
  const { t } = useI18n()
  const requestedPath = params['*'] || null

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (!isTextFileViewPath(requestedPath)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div
          className="w-full max-w-lg rounded-lg border border-destructive/30 bg-destructive/5 p-5"
          role="alert"
        >
          <p className="text-sm font-semibold text-foreground">
            {t('preview.inlineReadonly', { path: requestedPath })}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground" title={requestedPath}>
            {requestedPath}
          </p>
        </div>
      </div>
    )
  }
  const loadState = resolveEditorLoadState({
    fileContents: context.fileContents,
    loadingPaths: context.loadingPaths,
    path: requestedPath,
    saveStates: context.saveStates,
  })

  if (loadState.status === 'loading') {
    return <EditorPaneFallback label={t('editor.loadingDocument')} path={requestedPath} />
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
          <p className="mt-1 truncate text-xs text-muted-foreground" title={requestedPath}>
            {requestedPath}
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

  return (
    <SourceCodePage
      activePath={requestedPath}
      value={loadState.content}
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
