import { GitGraph } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

type GraphEmptyStateProps = {
  actionLabel?: string
  description: string
  onAction?: () => void
  title: string
}

export const GraphEmptyState = ({
  actionLabel,
  description,
  onAction,
  title,
}: GraphEmptyStateProps) => (
  <div
    aria-atomic="true"
    aria-live="polite"
    className="graph-empty-state pointer-events-none absolute inset-0 flex items-center justify-center p-6"
    role="status"
  >
    <Empty className="max-w-sm flex-none gap-3 border border-solid border-border bg-card/95 p-5 shadow-sm md:p-5">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="border border-border text-primary">
          <GitGraph aria-hidden="true" className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-sm font-semibold">{title}</EmptyTitle>
        <EmptyDescription className="text-xs leading-5">{description}</EmptyDescription>
      </EmptyHeader>
      {onAction && actionLabel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="pointer-events-auto h-8 rounded-md px-3 text-xs"
          onClick={onAction}
        >
          {actionLabel}
        </Button>
      ) : null}
    </Empty>
  </div>
)
