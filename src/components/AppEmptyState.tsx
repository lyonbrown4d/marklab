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
  titleLevel?: 1 | 2 | 3 | 4 | 5 | 6
}

const AppEmptyState = ({
  action,
  className,
  compact = false,
  description,
  icon,
  title,
  titleLevel = 2,
}: AppEmptyStateProps) => (
  <Empty
    className={cn(
      'rounded-lg border border-dashed border-border/80 bg-muted/20',
      compact ? 'min-h-20 gap-3 p-4 md:p-4' : 'min-h-48',
      className,
    )}
  >
    <EmptyHeader>
      {icon && <EmptyMedia variant="icon">{icon}</EmptyMedia>}
      <EmptyTitle
        aria-level={titleLevel}
        className={compact ? 'text-sm' : undefined}
        role="heading"
      >
        {title}
      </EmptyTitle>
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
