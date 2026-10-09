import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useShallow } from 'zustand/react/shallow'
import { nextEditorLoadRouteState } from '@/app/useEditorBuffer'
import { resolveEditorLoadState } from '@/app/useEditorBufferState'
import { Button } from '@/components/ui/button'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import SourceCodePage from '@/pages/SourceCodePage'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useI18n } from '@/i18n/useI18n'
import { isTextFileViewPath } from '@/logic/fileTypes'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { EditorFocusHandoffFailure } from '@/app/EditorFocusHandoff'

const SourceFilePage = () => {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const requestedPath = params['*'] || null
  const context = useLayoutContext(
    useShallow((state) => ({
      editorReadOnlyMode: state.editorReadOnlyMode,
      fileContents: state.fileContents,
      files: state.files,
      loading: requestedPath ? state.loadingPaths[requestedPath] : undefined,
      onEditorChange: state.onEditorChange,
      onOpenFile: state.onOpenFile,
      onOpenFileView: state.onOpenFileView,
      rootKind: state.rootKind,
      rootPath: state.rootPath,
      saveState: requestedPath ? state.saveStates[requestedPath] : undefined,
      showEditorStatusBar: state.showEditorStatusBar,
    })),
  )
  const { t } = useI18n()

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return (
      <>
        <EditorFocusHandoffFailure path={requestedPath} view="source" />
        <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
      </>
    )
  }

  if (!isTextFileViewPath(requestedPath)) {
    return (
      <>
        <EditorFocusHandoffFailure path={requestedPath} view="source" />
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
      </>
    )
  }
  const loadState = resolveEditorLoadState({
    fileContents: context.fileContents,
    loadingPaths: context.loading ? { [requestedPath]: true } : {},
    path: requestedPath,
    saveStates: context.saveState ? { [requestedPath]: context.saveState } : {},
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
      <>
        <EditorFocusHandoffFailure path={requestedPath} view="source" />
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
      </>
    )
  }

  return (
    <SourceCodePage
      activePath={requestedPath}
      workspaceKey={`${context.rootKind}:${context.rootPath}`}
      value={loadState.content}
      files={context.files}
      fileContents={context.fileContents}
      onChange={context.onEditorChange}
      onOpenFileView={context.onOpenFileView}
      showStatusBar={context.showEditorStatusBar}
      readOnly={context.editorReadOnlyMode}
    />
  )
}

export default SourceFilePage
