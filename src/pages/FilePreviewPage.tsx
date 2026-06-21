import { lazy, Suspense, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileImage, FileText, Loader2, Music, Video } from 'lucide-react'
import { useParams } from 'react-router-dom'
import MarkdownPdfPreview from '@/components/milkdown/MarkdownPdfPreview'
import DocxPreviewSurface from '@/components/previews/DocxPreviewSurface'
import DrawioEditorSurface from '@/components/previews/DrawioEditorSurface'
import { Button } from '@/components/ui/button'
import { getPreviewFileKind } from '@/logic/fileTypes'
import { createFileLabel } from '@/logic/paths'
import { convertAssetFileSrc } from '@/runtime/assets'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { useI18n } from '@/i18n/useI18n'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useLayoutContext } from '@/pages/useLayoutContext'

const ExcalidrawEditorSurface = lazy(() => import('@/components/previews/ExcalidrawEditorSurface'))

const FilePreviewPage = () => {
  const params = useParams()
  const context = useLayoutContext()
  const { t } = useI18n()
  const requestedPath = params['*'] || null
  const previewKind = requestedPath ? getPreviewFileKind(requestedPath) : null
  const title = requestedPath ? createFileLabel(requestedPath) : ''

  const metadataQuery = useQuery({
    queryKey: ['file-preview-metadata', requestedPath],
    queryFn: () => fsApi.getPathMetadata(requestedPath ?? ''),
    enabled: isDesktopRuntime() && Boolean(requestedPath && previewKind),
    staleTime: 10_000,
  })

  const previewSrc = useMemo(() => {
    const absolutePath = metadataQuery.data?.absolute_path
    return absolutePath ? convertAssetFileSrc(absolutePath) : null
  }, [metadataQuery.data?.absolute_path])
  const resolvePreviewPdfSrc = useCallback(async () => {
    if (!previewSrc) throw new Error('Preview source is not ready')
    return previewSrc
  }, [previewSrc])

  const openInSystem = useCallback(() => {
    if (!requestedPath) return
    void fsApi.openPathInSystem(requestedPath)
  }, [requestedPath])

  if (!requestedPath || !fileExists(context.files, requestedPath)) {
    return <FileRouteNotFound files={context.files} onOpenFile={context.onOpenFile} />
  }

  if (!previewKind) {
    return (
      <div className="flex h-full items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-xl border border-border bg-card p-5 text-card-foreground shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4 text-muted-foreground" />
            {t('preview.unsupportedTitle')}
          </div>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {t('preview.unsupportedDescription')}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border/80 px-3">
        <div className="flex min-w-0 items-center gap-2">
          {previewKind === 'image' ? (
            <FileImage className="size-4 shrink-0 text-muted-foreground" />
          ) : previewKind === 'audio' ? (
            <Music className="size-4 shrink-0 text-muted-foreground" />
          ) : previewKind === 'video' ? (
            <Video className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="size-4 shrink-0 text-muted-foreground" />
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{title}</div>
            <div className="truncate text-[11px] text-muted-foreground">{requestedPath}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1.5" onClick={openInSystem}>
          <ExternalLink className="size-3.5" />
          {t('preview.openInSystem')}
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-auto p-4">
        {metadataQuery.isLoading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('preview.loading')}
          </div>
        ) : metadataQuery.isError || !previewSrc ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {t('preview.failed')}
          </div>
        ) : previewKind === 'docx' ? (
          <DocxPreviewSurface src={previewSrc} title={title} />
        ) : previewKind === 'drawio' ? (
          <DrawioEditorSurface
            path={requestedPath}
            readonly={metadataQuery.data?.readonly ?? false}
            title={title}
          />
        ) : previewKind === 'excalidraw' ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                {t('preview.loading')}
              </div>
            }
          >
            <ExcalidrawEditorSurface
              key={requestedPath}
              path={requestedPath}
              readonly={metadataQuery.data?.readonly ?? false}
              title={title}
            />
          </Suspense>
        ) : previewKind === 'pdf' ? (
          <div className="crepe h-full">
            <div className="milkdown h-full rounded-xl border border-border bg-background p-3">
              <MarkdownPdfPreview
                documentPath={null}
                href={requestedPath}
                resolvePdfSrc={resolvePreviewPdfSrc}
                title={title}
              />
            </div>
          </div>
        ) : previewKind === 'image' ? (
          <div className="flex min-h-full items-center justify-center">
            <img
              src={previewSrc}
              alt={t('preview.imageAlt', { name: title })}
              className="max-h-[calc(100vh-9rem)] max-w-full rounded-xl border border-border bg-card object-contain shadow-sm"
              draggable={false}
            />
          </div>
        ) : previewKind === 'video' ? (
          <div className="flex min-h-full items-center justify-center">
            <video
              className="max-h-[calc(100vh-9rem)] max-w-full rounded-xl border border-border bg-black shadow-sm"
              controls
              preload="metadata"
              src={previewSrc}
            >
              {t('preview.videoUnsupported')}
            </video>
          </div>
        ) : (
          <div className="flex min-h-full items-center justify-center">
            <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Music className="size-4 text-muted-foreground" />
                {title}
              </div>
              <audio className="w-full" controls preload="metadata" src={previewSrc}>
                {t('preview.audioUnsupported')}
              </audio>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default FilePreviewPage
