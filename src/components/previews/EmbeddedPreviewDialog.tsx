import AppAlert from '@/components/AppAlert'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { ZoomableVisualViewport } from '@/components/previews/ZoomableVisualViewport'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EmbeddedPreviewResolvedTarget } from '@/components/previews/embeddedPreviewSource'
import { useI18n } from '@/i18n/useI18n'

type EmbeddedPreviewDialogProps = {
  failed: boolean
  failedLabel: string
  loadingLabel: string
  onOpenChange: (open: boolean) => void
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
  open,
  ready,
  resolved,
  target,
  title,
}: EmbeddedPreviewDialogProps) => {
  const { t } = useI18n()
  const imageReady = resolved?.kind === 'image' && ready

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-4 py-3">
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
              <div className="flex h-full items-center justify-center">
                <AppAlert aria-label={failedLabel} className="w-full max-w-md" tone="destructive">
                  {failedLabel}
                </AppAlert>
              </div>
            ) : (
              <PreviewLoadingFallback label={loadingLabel} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
