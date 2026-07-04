import { GitGraph } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

type GraphEmptyStateProps = {
  description: string
  title: string
}

export const GraphEmptyState = ({ description, title }: GraphEmptyStateProps) => (
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
    </Empty>
  </div>
)
