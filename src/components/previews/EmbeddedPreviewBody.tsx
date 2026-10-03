import AppAlert from '@/components/AppAlert'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { GraphPdfPreviewGate } from '@/components/previews/GraphPdfPreviewGate'
import type { EmbeddedPreviewResolvedTarget } from '@/components/previews/embeddedPreviewSource'

export type EmbeddedPreviewVariant = 'document' | 'graph'

type EmbeddedPreviewBodyProps = {
  displayTitle: string
  failed: boolean
  failedLabel: string
  graphPdfLoadLabel: string
  loadingLabel: string
  pendingLabel: string
  refreshTarget: () => Promise<EmbeddedPreviewResolvedTarget | null>
  resolved: EmbeddedPreviewResolvedTarget | null
  shouldResolve: boolean
  status: string
  target: string
  variant: EmbeddedPreviewVariant
}

export const EmbeddedPreviewBody = ({
  displayTitle,
  failed,
  failedLabel,
  graphPdfLoadLabel,
  loadingLabel,
  pendingLabel,
  refreshTarget,
  resolved,
  shouldResolve,
  status,
  target,
  variant,
}: EmbeddedPreviewBodyProps) => {
  if (failed) {
    return (
      <div className="flex min-h-28 items-center justify-center p-3">
        <AppAlert aria-label={failedLabel} className="w-full max-w-md" tone="destructive">
          {failedLabel}
        </AppAlert>
      </div>
    )
  }

  if (variant === 'graph' && !resolved) {
    return (
      <div
        className="flex min-h-24 items-center justify-center bg-muted/25 px-3 text-center text-xs text-muted-foreground"
        data-slot="embedded-preview-placeholder"
      >
        {shouldResolve ? loadingLabel : pendingLabel}
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

  if (variant === 'graph' && resolved.kind === 'pdf') {
    return (
      <div
        className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden bg-muted/20 p-2"
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) event.stopPropagation()
        }}
      >
        <span className="sr-only">{status}</span>
        <GraphPdfPreviewGate
          label={graphPdfLoadLabel}
          path={resolved.path ?? target}
          readonly={resolved.readonly}
          refreshTarget={refreshTarget}
          src={resolved.src}
          title={displayTitle}
        />
      </div>
    )
  }

  return (
    <div
      className={`${variant === 'graph' ? 'h-[calc(100%-2.5rem)]' : ''} min-h-0 overflow-hidden bg-muted/20 p-2`}
      onWheel={(event) => {
        if (variant === 'graph' && !event.ctrlKey && !event.metaKey) event.stopPropagation()
      }}
    >
      <span className="sr-only">{status}</span>
      <FilePreviewSurface
        kind={resolved.kind}
        path={resolved.path ?? target}
        presentation={variant === 'graph' ? 'graph' : 'embedded'}
        readonly={resolved.readonly}
        src={resolved.src}
        title={displayTitle}
      />
    </div>
  )
}
