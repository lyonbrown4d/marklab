import AppAlert from '@/components/AppAlert'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { Button } from '@/components/ui/button'
import type { EmbeddedPreviewResolvedTarget } from '@/components/previews/embeddedPreviewSource'

type EmbeddedPreviewBodyProps = {
  displayTitle: string
  failed: boolean
  failedLabel: string
  loadingLabel: string
  pendingLabel: string
  retryLabel: string
  refreshTarget: () => Promise<EmbeddedPreviewResolvedTarget | null>
  resolved: EmbeddedPreviewResolvedTarget | null
  shouldResolve: boolean
  status: string
  target: string
}

export const EmbeddedPreviewBody = ({
  displayTitle,
  failed,
  failedLabel,
  loadingLabel,
  pendingLabel,
  retryLabel,
  refreshTarget,
  resolved,
  shouldResolve,
  status,
  target,
}: EmbeddedPreviewBodyProps) => {
  if (failed) {
    return (
      <div className="flex min-h-28 flex-col items-center justify-center gap-3 p-3">
        <AppAlert aria-label={failedLabel} className="w-full max-w-md" tone="destructive">
          {failedLabel}
        </AppAlert>
        <Button size="sm" variant="outline" onClick={() => void refreshTarget()}>
          {retryLabel}
        </Button>
      </div>
    )
  }

  if (!resolved) {
    return shouldResolve ? (
      <div className="min-h-48">
        <PreviewLoadingFallback label={loadingLabel} />
      </div>
    ) : (
      <div
        aria-label={pendingLabel}
        className="flex min-h-28 items-center justify-center px-3 text-xs text-muted-foreground"
        role="status"
      >
        {pendingLabel}
      </div>
    )
  }

  return (
    <div className="min-h-0 overflow-hidden bg-muted/20 p-2">
      <span className="sr-only">{status}</span>
      <FilePreviewSurface
        kind={resolved.kind}
        path={resolved.path ?? target}
        presentation="embedded"
        readonly={resolved.readonly}
        src={resolved.src}
        title={displayTitle}
      />
    </div>
  )
}
