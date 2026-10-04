import { AlertTriangle, Globe2, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

type WebTabStatusOverlayProps = {
  errorDescription?: string
  failed: boolean
  interactionClassName?: string
  loading: boolean
  onRetry: () => void
}

export const WebTabStatusOverlay = ({
  errorDescription,
  failed,
  interactionClassName,
  loading,
  onRetry,
}: WebTabStatusOverlayProps) => {
  const { t } = useI18n()
  if (loading) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <span className="relative flex size-10 items-center justify-center rounded-xl border border-border/70 bg-background shadow-sm">
          <Globe2 aria-hidden className="size-4" />
          <LoaderCircle
            aria-hidden
            className="absolute -right-1 -top-1 size-3.5 animate-spin text-primary motion-reduce:animate-none"
          />
        </span>
        <span className="text-xs">{t('webTab.loading')}</span>
      </div>
    )
  }
  if (!failed) return null
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <div
        className={cn(
          'max-w-sm rounded-xl border border-destructive/25 bg-background p-4 text-center shadow-sm',
          interactionClassName,
        )}
        role="alert"
      >
        <AlertTriangle aria-hidden className="mx-auto size-5 text-destructive" />
        <p className="mt-2 text-sm font-semibold">{t('webTab.failed')}</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {errorDescription ?? t('webTab.failedHint')}
        </p>
        <Button className="mt-3" size="sm" type="button" variant="outline" onClick={onRetry}>
          {t('webTab.retry')}
        </Button>
      </div>
    </div>
  )
}
