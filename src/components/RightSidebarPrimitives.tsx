import type { ReactNode } from 'react'
import AppEmptyState from '@/components/AppEmptyState'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const InspectorMetric = ({
  icon,
  label,
  value,
  tone = 'normal',
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  tone?: 'normal' | 'warning' | 'error'
}) => {
  const toneClass = cn(
    'text-foreground',
    tone === 'error' && 'text-destructive',
    tone === 'warning' && 'text-primary',
  )

  return (
    <div className="flex min-w-0 items-center gap-2 px-1 py-1.5">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 text-xs font-semibold tabular-nums', toneClass)}>{value}</span>
    </div>
  )
}

export const InspectorEmptyState = ({
  icon,
  title,
  description,
}: {
  icon: ReactNode
  title: string
  description: string
}) => {
  return (
    <AppEmptyState
      compact
      className="min-h-32 flex-none rounded-none border-0 bg-transparent px-3 py-5"
      description={description}
      descriptionClassName="max-w-[13rem] break-words text-xs leading-5"
      icon={icon}
      mediaClassName="mb-1 rounded-none border-0 bg-transparent text-muted-foreground"
      title={title}
      titleClassName="text-xs"
      titleLevel={3}
    />
  )
}

export const ProblemGroupHeader = ({
  label,
  count,
  tone,
}: {
  label: string
  count: number
  tone: 'warning' | 'error'
}) => {
  const toneClass = tone === 'error' ? 'text-destructive' : 'text-primary'

  return (
    <div
      className={cn('flex items-center justify-between px-2 py-2 text-xs font-medium', toneClass)}
    >
      <span>{label}</span>
      <Badge
        variant={tone === 'error' ? 'outline' : 'secondary'}
        className={cn(
          'h-4 min-w-4 rounded px-1 text-[10px] leading-none',
          tone === 'error' && 'border-destructive/40 text-destructive',
        )}
      >
        {count}
      </Badge>
    </div>
  )
}

export const PropertyCell = ({ label, value }: { label: string; value: ReactNode }) => {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-1.5 text-xs">
      <div className="shrink-0 text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words text-right leading-5 tabular-nums">{value}</div>
    </div>
  )
}
