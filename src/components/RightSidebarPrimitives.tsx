import type { ReactNode } from 'react'
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
    <div className="side-stat flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1">
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
    <div className="flex min-h-28 flex-col items-center justify-center rounded-lg border border-border/70 bg-muted/25 px-3 text-center">
      <div className="mb-2 rounded-md border border-border/70 bg-background/70 p-2 text-muted-foreground">
        {icon}
      </div>
      <div className="text-xs font-medium">{title}</div>
      <div className="mt-1 max-w-[13rem] truncate text-[11px] text-muted-foreground">
        {description}
      </div>
    </div>
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
      className={cn(
        'flex items-center justify-between rounded-md border border-border/60 bg-muted/35 px-2 py-1 text-[11px] font-medium',
        toneClass,
      )}
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
    <div className="rounded-md border border-border/70 bg-muted/25 p-2">
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium">{value}</div>
    </div>
  )
}
