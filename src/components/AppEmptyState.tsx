import type { AriaRole, ReactNode } from 'react'
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
  descriptionClassName?: string
  icon?: ReactNode
  mediaClassName?: string
  role?: AriaRole
  title: ReactNode
  titleClassName?: string
  titleLevel?: 1 | 2 | 3 | 4 | 5 | 6
}

const AppEmptyState = ({
  action,
  className,
  compact = false,
  description,
  descriptionClassName,
  icon,
  mediaClassName,
  role,
  title,
  titleClassName,
  titleLevel = 2,
}: AppEmptyStateProps) => (
  <Empty
    className={cn(
      'rounded-lg border border-dashed border-border/80 bg-muted/20',
      compact ? 'min-h-20 gap-3 p-4 md:p-4' : 'min-h-48',
      className,
    )}
    role={role}
  >
    <EmptyHeader>
      {icon ? (
        <EmptyMedia className={mediaClassName} variant="icon">
          {icon}
        </EmptyMedia>
      ) : null}
      <EmptyTitle
        aria-level={titleLevel}
        className={cn(compact && 'text-sm', titleClassName)}
        role="heading"
      >
        {title}
      </EmptyTitle>
      {description ? (
        <EmptyDescription className={cn(compact && 'text-xs leading-5', descriptionClassName)}>
          {description}
        </EmptyDescription>
      ) : null}
    </EmptyHeader>
    {action && <EmptyContent>{action}</EmptyContent>}
  </Empty>
)

export default AppEmptyState
