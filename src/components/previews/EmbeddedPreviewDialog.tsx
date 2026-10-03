import AppAlert from '@/components/AppAlert'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { EmbeddedPreviewResolvedTarget } from '@/components/previews/embeddedPreviewSource'

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
}: EmbeddedPreviewDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[92vh] max-w-[96vw] flex-col p-0">
      <DialogHeader className="border-b border-border px-4 py-3">
        <DialogTitle className="truncate text-sm">{title}</DialogTitle>
      </DialogHeader>
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
    </DialogContent>
  </Dialog>
)
