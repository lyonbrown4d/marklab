import { GitGraph } from 'lucide-react'

type GraphEmptyStateProps = {
  description: string
  title: string
}

export const GraphEmptyState = ({ description, title }: GraphEmptyStateProps) => (
  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
    <div className="max-w-sm rounded-md border border-border bg-card/95 p-5 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md border border-border bg-muted">
        <GitGraph className="h-5 w-5 text-primary" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{description}</div>
    </div>
  </div>
)
