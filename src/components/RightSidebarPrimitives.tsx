import type { ReactNode } from 'react'

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
  const toneClass =
    tone === 'error'
      ? 'text-destructive'
      : tone === 'warning'
        ? 'text-amber-600'
        : 'text-foreground'

  return (
    <div className="side-stat flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{label}</span>
      <span className={`shrink-0 text-xs font-semibold ${toneClass}`}>{value}</span>
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
    <div className="flex min-h-28 flex-col items-center justify-center rounded-md border border-dashed border-sidebar-border/80 bg-background/45 px-3 text-center">
      <div className="mb-2 rounded-md border border-border bg-muted p-2 text-muted-foreground">
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
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 text-[11px] font-medium ${
        tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
      }`}
    >
      <span>{label}</span>
      <span>{count}</span>
    </div>
  )
}

export const PropertyCell = ({ label, value }: { label: string; value: ReactNode }) => {
  return (
    <div className="rounded-md border border-border bg-background/55 p-2">
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-xs font-medium">{value}</div>
    </div>
  )
}
