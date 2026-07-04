import { lazy, Suspense } from 'react'
import { FileText, Music } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { PreviewFileKind } from '@/logic/fileTypes'
import AppEmptyState from '@/components/AppEmptyState'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'

const DocxPreviewSurface = lazy(() => import('@/components/previews/DocxPreviewSurface'))
const DrawioEditorSurface = lazy(() => import('@/components/previews/DrawioEditorSurface'))
const ExcalidrawEditorSurface = lazy(() => import('@/components/previews/ExcalidrawEditorSurface'))
const PdfPreviewSurface = lazy(() =>
  import('@/components/milkdown/MarkdownPdfPreview').then((module) => ({
    default: module.PdfPreviewSurface,
  })),
)

type FilePreviewSurfaceProps = {
  kind: PreviewFileKind
  path: string
  readonly?: boolean
  src: string
  title: string
}

const FilePreviewSurface = ({
  kind,
  path,
  readonly = false,
  src,
  title,
}: FilePreviewSurfaceProps) => {
  const { t } = useI18n()

  if (kind === 'docx') {
    return (
      <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
        <DocxPreviewSurface src={src} title={title} />
      </Suspense>
    )
  }

  if (kind === 'drawio') {
    return (
      <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
        <DrawioEditorSurface path={path} readonly={readonly} title={title} />
      </Suspense>
    )
  }

  if (kind === 'excalidraw') {
    return (
      <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
        <ExcalidrawEditorSurface key={path} path={path} readonly={readonly} title={title} />
      </Suspense>
    )
  }

  if (kind === 'pdf') {
    return (
      <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
        <div className="crepe h-full">
          <div className="milkdown h-full rounded-xl border border-border bg-background p-3">
            <PdfPreviewSurface fileUrl={src} mode="modal" />
          </div>
        </div>
      </Suspense>
    )
  }

  if (kind === 'image') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <img
          src={src}
          alt={t('preview.imageAlt', { name: title })}
          className="max-h-[calc(100vh-9rem)] max-w-full rounded-xl border border-border bg-card object-contain shadow-sm"
          draggable={false}
        />
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <video
          className="max-h-[calc(100vh-9rem)] max-w-full rounded-xl border border-border bg-black shadow-sm"
          controls
          preload="metadata"
          src={src}
        >
          {t('preview.videoUnsupported')}
        </video>
      </div>
    )
  }

  if (kind === 'audio') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Music className="size-4 text-muted-foreground" />
            {title}
          </div>
          <audio className="w-full" controls preload="metadata" src={src}>
            {t('preview.audioUnsupported')}
          </audio>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <AppEmptyState
        compact
        className="w-full max-w-md"
        icon={<FileText />}
        role="note"
        title={t('preview.unsupportedTitle')}
        titleLevel={3}
      />
    </div>
  )
}

export default FilePreviewSurface
