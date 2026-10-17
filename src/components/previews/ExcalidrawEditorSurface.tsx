import { Excalidraw, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { Save } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { useQuery } from '@tanstack/react-query'

import AppAlert from '@/components/AppAlert'
import { DocumentLoadingState } from '@/components/loading/DocumentLoadingState'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { fsApi } from '@/services/fsApi'
import { createDocumentBufferSession } from '@/services/documentBufferSession'
import { useI18n } from '@/i18n/useI18n'

import { parseExcalidrawDocument } from '@/components/previews/excalidrawDocument'
import { useLayoutContext } from '@/pages/useLayoutContext'
import { readPreviewTextAsset } from '@/services/readPreviewAsset'

type ExcalidrawEditorSurfaceProps = {
  src?: string
  path: string
  readonly?: boolean
  title: string
}

type ExcalidrawChangeHandler = NonNullable<ComponentProps<typeof Excalidraw>['onChange']>
type ExcalidrawInitialData = ComponentProps<typeof Excalidraw>['initialData']

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const ExcalidrawEditorSurface = ({
  path,
  readonly = false,
  src,
  title,
}: ExcalidrawEditorSurfaceProps) => {
  const { t } = useI18n()
  const rootKind = useLayoutContext((state) => state.rootKind)
  const rootPath = useLayoutContext((state) => state.rootPath)
  const workspaceKey = `${rootKind}:${rootPath}`
  const bufferSession = useMemo(
    () => createDocumentBufferSession(workspaceKey, path),
    [workspaceKey, path],
  )
  const latestContentRef = useRef<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const documentQuery = useQuery({
    queryKey: ['file-preview', 'excalidraw', rootKind, rootPath, path, ...(src ? [src] : [])],
    queryFn: async () => {
      const snapshot = src ? null : await fsApi.openBufferSnapshot(path)
      const content = snapshot ? snapshot.content : (await readPreviewTextAsset(src!)).content
      return { ...parseExcalidrawDocument(content), snapshot }
    },
    retry: false,
    gcTime: 0,
  })

  useEffect(() => {
    if (documentQuery.data?.snapshot) bufferSession.seed(documentQuery.data.snapshot)
  }, [bufferSession, documentQuery.dataUpdatedAt, documentQuery.data?.snapshot])

  const handleChange = useCallback<ExcalidrawChangeHandler>((elements, appState, files) => {
    latestContentRef.current = serializeAsJSON(elements, appState, files, 'local')
    setDirty(true)
    setSaveError(null)
  }, [])

  const handleSave = useCallback(async () => {
    const content = latestContentRef.current ?? documentQuery.data?.content

    if (!content || readonly) {
      return
    }

    setSaving(true)
    setSaveError(null)

    try {
      await bufferSession.save(content, true)
      setDirty(false)
    } catch (error) {
      setSaveError(errorMessage(error, t('preview.excalidrawSaveFailedFallback')))
    } finally {
      setSaving(false)
    }
  }, [bufferSession, documentQuery.data?.content, readonly, t])

  if (documentQuery.isLoading) {
    return <DocumentLoadingState className="h-full p-6" label={t('preview.excalidrawLoading')} />
  }

  if (documentQuery.isError || !documentQuery.data) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <AppAlert
          tone="destructive"
          title={t('preview.excalidrawOpenFailedTitle')}
          className="max-w-md"
        >
          {errorMessage(documentQuery.error, t('preview.excalidrawOpenFallback'))}
        </AppAlert>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b bg-card/80 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">
            {readonly
              ? t('preview.excalidrawReadOnly')
              : dirty
                ? t('preview.excalidrawUnsaved')
                : t('preview.excalidrawSaved')}
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={readonly || !dirty || saving}>
          {saving ? (
            <Spinner aria-hidden="true" data-icon="inline-start" role="presentation" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          {t('preview.excalidrawSave')}
        </Button>
      </div>
      {saveError && (
        <AppAlert
          tone="destructive"
          className="rounded-none border-x-0 border-t-0 px-3 py-2 text-xs"
        >
          {saveError}
        </AppAlert>
      )}
      <div className="min-h-0 flex-1">
        <Excalidraw
          key={`${workspaceKey}:${path}:${src ?? 'worktree'}`}
          initialData={documentQuery.data.initialData as ExcalidrawInitialData}
          onChange={handleChange}
          viewModeEnabled={readonly}
        />
      </div>
    </div>
  )
}

export default ExcalidrawEditorSurface
