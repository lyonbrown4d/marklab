import { useId, type ReactNode } from 'react'
import { CircleMinus } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty'
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
  <Empty
    className="min-h-10 flex-none items-stretch gap-0 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-left md:p-2"
    role="note"
  >
    <EmptyHeader className="max-w-none flex-row items-center justify-start gap-2 text-left">
      <EmptyMedia
        aria-hidden="true"
        className="mb-0 size-6 rounded-md text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5"
        variant="icon"
      >
        <CircleMinus />
      </EmptyMedia>
      <EmptyDescription className="truncate text-xs leading-5">{label}</EmptyDescription>
    </EmptyHeader>
  </Empty>
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
