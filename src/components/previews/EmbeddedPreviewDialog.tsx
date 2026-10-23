import AppAlert from '@/components/AppAlert'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { ZoomableVisualViewport } from '@/components/previews/ZoomableVisualViewport'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResizableDialogContent } from '@/components/ui/ResizableDialogContent'
import type { EmbeddedPreviewResolvedTarget } from '@/components/previews/embeddedPreviewSource'
import { useI18n } from '@/i18n/useI18n'
import { Button } from '@/components/ui/button'

type EmbeddedPreviewDialogProps = {
  failed: boolean
  failedLabel: string
  loadingLabel: string
  onOpenChange: (open: boolean) => void
  onRetry?: () => void
  open: boolean
  ready: boolean
  resolved: EmbeddedPreviewResolvedTarget | null
  target: string
  title: string
}

export const EmbeddedPreviewDialog = ({
  failed,
  failedLabel,
  loadingLabel,
  onOpenChange,
  onRetry,
  open,
  ready,
  resolved,
  target,
  title,
}: EmbeddedPreviewDialogProps) => {
  const { t } = useI18n()
  const imageReady = resolved?.kind === 'image' && ready
  useNativeSurfaceOcclusion('embedded-preview-dialog', open, { blocksCommandPalette: true })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent
        className="flex flex-col gap-0 p-0"
        resizeLabels={{
          width: t('preview.resizeWidth'),
          height: t('preview.resizeHeight'),
          size: t('preview.resizeSize'),
        }}
      >
        <DialogHeader className="border-b border-border px-4 py-3 pr-14 text-left">
          <DialogTitle className="truncate text-sm">{title}</DialogTitle>
        </DialogHeader>
        {imageReady ? (
          <ZoomableVisualViewport
            labels={{
              resetZoom: t('preview.visualResetZoom'),
              zoomIn: t('preview.visualZoomIn'),
              zoomLevel: t('preview.visualZoomLevel'),
              zoomOut: t('preview.visualZoomOut'),
            }}
            visual={{
              alt: t('preview.imageAlt', { name: title }),
              kind: 'image',
              src: resolved.src,
            }}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {resolved && ready ? (
              <FilePreviewSurface
                kind={resolved.kind}
                path={resolved.path ?? target}
                presentation="full"
                readonly={resolved.readonly}
                src={resolved.src}
                title={title}
              />
            ) : failed ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <AppAlert aria-label={failedLabel} className="w-full max-w-md" tone="destructive">
                  {failedLabel}
                </AppAlert>
                {onRetry ? (
                  <Button size="sm" variant="outline" onClick={onRetry}>
                    {t('actions.retry')}
                  </Button>
                ) : null}
              </div>
            ) : (
              <PreviewLoadingFallback label={loadingLabel} />
            )}
          </div>
        )}
      </ResizableDialogContent>
    </Dialog>
  )
}
