import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

type SectionProps = {
  children: ReactNode
  title: string
}

export const Section = ({ children, title }: SectionProps) => {
  const titleId = useId()

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-2" role="region">
      <h3
        className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        id={titleId}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}

export const EmptyState = ({ label }: { label: string }) => (
  <div
    className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs leading-5 text-muted-foreground"
    role="note"
  >
    {label}
  </div>
)

type StatusRowProps = {
  children: ReactNode
  dotClassName: string
  meta?: string
}

export const StatusRow = ({ children, dotClassName, meta }: StatusRowProps) => (
  <div className="flex min-h-10 min-w-0 items-start gap-2 rounded-md border border-border/70 bg-background/80 px-3 py-2 shadow-sm transition-colors">
    <span
      aria-hidden="true"
      className={cn('mt-1.5 size-2 shrink-0 rounded-full', dotClassName)}
      data-status-dot="true"
    />
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs text-foreground">{children}</div>
      {meta && (
        <div className="mt-0.5 truncate text-[11px] text-muted-foreground" title={meta}>
          {meta}
        </div>
      )}
    </div>
  </div>
)
