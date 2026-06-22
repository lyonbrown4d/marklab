import { useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, FileImage, FileText, Loader2, Music, Video } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { getPreviewFileKind } from '@/logic/fileTypes'
import { createFileLabel } from '@/logic/paths'
import { convertAssetFileSrc } from '@/runtime/assets'
import { isDesktopRuntime } from '@/runtime/environment'
import { fsApi } from '@/services/fsApi'
import { useI18n } from '@/i18n/useI18n'
import { FileRouteNotFound, fileExists } from '@/pages/fileRouteHelpers'
import { useLayoutContext } from '@/pages/useLayoutContext'

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
        ) : (
          <FilePreviewSurface
            kind={previewKind}
            path={requestedPath}
            readonly={metadataQuery.data?.readonly ?? false}
            src={previewSrc}
            title={title}
          />
        )}
      </main>
    </div>
  )
}

export default FilePreviewPage
