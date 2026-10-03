import { lazy, Suspense } from 'react'
import { FileText, Music } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { PreviewFileKind } from '@/logic/fileTypes'
import AppEmptyState from '@/components/AppEmptyState'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'

const DocxPreviewSurface = lazy(() => import('@/components/previews/DocxPreviewSurface'))
const DrawioEditorSurface = lazy(() => import('@/components/previews/DrawioEditorSurface'))
const ExcalidrawEditorSurface = lazy(() => import('@/components/previews/ExcalidrawEditorSurface'))
const SourcePreviewSurface = lazy(() => import('@/components/previews/SourcePreviewSurface'))
const PdfPreviewSurface = lazy(() =>
  import('@/components/previews/PdfPreviewSurface').then((module) => ({
    default: module.PdfPreviewSurface,
  })),
)

type FilePreviewSurfaceProps = {
  kind: PreviewFileKind
  path: string
  presentation?: 'embedded' | 'full' | 'graph'
  readonly?: boolean
  src: string
  title: string
}

const FilePreviewSurface = ({
  kind,
  path,
  presentation = 'full',
  readonly = false,
  src,
  title,
}: FilePreviewSurfaceProps) => {
  const { t } = useI18n()

  if (kind === 'source') {
    return (
      <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
        <SourcePreviewSurface path={path} presentation={presentation} title={title} />
      </Suspense>
    )
  }

  if (presentation === 'graph' && (kind === 'docx' || kind === 'drawio' || kind === 'excalidraw')) {
    return (
      <div
        className="flex h-full min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 px-3 text-center"
        data-slot="graph-preview-placeholder"
      >
        <div className="min-w-0">
          <FileText className="mx-auto mb-2 size-5 text-muted-foreground" aria-hidden="true" />
          <div className="truncate text-xs font-medium text-foreground">{title}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {t(`preview.kind.${kind}`)}
          </div>
        </div>
      </div>
    )
  }

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
        <div className={presentation === 'embedded' ? 'h-[32rem]' : 'h-full min-h-[32rem]'}>
          <ExcalidrawEditorSurface key={path} path={path} readonly={readonly} title={title} />
        </div>
      </Suspense>
    )
  }

  if (kind === 'pdf') {
    return (
      <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
        <div
          className={`${presentation === 'graph' ? 'h-full overflow-auto p-1' : 'h-full p-3'} rounded-xl border border-border bg-background`}
        >
          <PdfPreviewSurface
            fileUrl={src}
            mode={presentation === 'graph' ? 'graph' : presentation === 'full' ? 'modal' : 'inline'}
          />
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
          className={`${presentation === 'graph' ? 'max-h-full' : presentation === 'embedded' ? 'max-h-[32rem]' : 'max-h-[calc(100vh-9rem)]'} max-w-full rounded-xl border border-border bg-card object-contain shadow-sm`}
          draggable={false}
          loading={presentation === 'graph' ? 'lazy' : undefined}
        />
      </div>
    )
  }

  if (kind === 'video') {
    return (
      <div className="flex min-h-full items-center justify-center">
        <video
          className={`${presentation === 'graph' ? 'max-h-full' : presentation === 'embedded' ? 'max-h-[32rem]' : 'max-h-[calc(100vh-9rem)]'} max-w-full rounded-xl border border-border bg-black shadow-sm`}
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
