import { useState, type ReactNode } from 'react'
import { ExternalLink, Info, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type TaskStatusLabels = {
  cancel: string
  retry: string
  showDetails: string
  open?: string
}

type TaskStatusRowProps = {
  children: ReactNode
  details?: string | null
  dotClassName: string
  labels: TaskStatusLabels
  meta?: string
  onCancel?: () => void | Promise<unknown>
  onOpen?: () => void | Promise<unknown>
  onRetry?: () => void | Promise<unknown>
}

export const TaskStatusRow = ({
  children,
  details,
  dotClassName,
  labels,
  meta,
  onCancel,
  onOpen,
  onRetry,
}: TaskStatusRowProps) => {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const effectiveDetails = actionError ?? details
  const captureActionError = (error: unknown) => {
    setActionError(error instanceof Error ? error.message : String(error))
    setDetailsOpen(true)
  }
  const runAction = (action: () => void | Promise<unknown>) => {
    if (actionPending) return
    setActionPending(true)
    setActionError(null)
    try {
      void Promise.resolve(action())
        .catch(captureActionError)
        .finally(() => setActionPending(false))
    } catch (error) {
      captureActionError(error)
      setActionPending(false)
    }
  }

  return (
    <div
      aria-busy={actionPending || undefined}
      className="group rounded-md border border-border/70 bg-background/80 px-3 py-2 shadow-sm"
    >
      <div className="flex min-h-6 min-w-0 items-center gap-2">
        <span
          aria-hidden="true"
          className={cn('size-2 shrink-0 rounded-full', dotClassName)}
          data-status-dot="true"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-foreground">{children}</div>
          {meta ? <div className="truncate text-[11px] text-muted-foreground">{meta}</div> : null}
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
          {effectiveDetails ? (
            <Button
              aria-expanded={detailsOpen}
              aria-label={labels.showDetails}
              onClick={() => setDetailsOpen((current) => !current)}
              size="icon-xs"
              variant="ghost"
            >
              <Info aria-hidden="true" />
            </Button>
          ) : null}
          {onRetry ? (
            <Button
              aria-label={labels.retry}
              disabled={actionPending}
              onClick={() => runAction(onRetry)}
              size="icon-xs"
              variant="ghost"
            >
              <RotateCcw aria-hidden="true" />
            </Button>
          ) : null}
          {onOpen && labels.open ? (
            <Button
              aria-label={labels.open}
              disabled={actionPending}
              onClick={() => runAction(onOpen)}
              size="icon-xs"
              variant="ghost"
            >
              <ExternalLink aria-hidden="true" />
            </Button>
          ) : null}
          {onCancel ? (
            <Button
              aria-label={labels.cancel}
              disabled={actionPending}
              onClick={() => runAction(onCancel)}
              size="icon-xs"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
      {detailsOpen && effectiveDetails ? (
        <p
          className="mt-2 break-words border-t border-border/60 pt-2 text-[11px] text-muted-foreground"
          role={actionError ? 'alert' : undefined}
        >
          {effectiveDetails}
        </p>
      ) : null}
    </div>
  )
}
