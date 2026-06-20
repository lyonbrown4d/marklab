import type { ReactNode } from 'react'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'

type AppEmptyStateProps = {
  action?: ReactNode
  className?: string
  compact?: boolean
  description?: ReactNode
  icon?: ReactNode
  title: ReactNode
}

const AppEmptyState = ({
  action,
  className,
  compact = false,
  description,
  icon,
  title,
}: AppEmptyStateProps) => (
  <Empty
    className={cn(
      'border border-dashed border-border/80 bg-muted/20',
      compact ? 'min-h-20 gap-3 p-4 md:p-4' : 'min-h-48',
      className,
    )}
  >
    <EmptyHeader>
      {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
      <EmptyTitle className={compact ? 'text-sm' : undefined}>{title}</EmptyTitle>
      {description && (
        <EmptyDescription className={compact ? 'text-xs leading-5' : undefined}>
          {description}
        </EmptyDescription>
      )}
    </EmptyHeader>
    {action && <EmptyContent>{action}</EmptyContent>}
  </Empty>
)

export default AppEmptyState
