import type { ReactNode } from 'react'

type SectionProps = {
  children: ReactNode
  title: string
}

export const Section = ({ children, title }: SectionProps) => (
  <section className="space-y-2">
    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {title}
    </h3>
    {children}
  </section>
)

export const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-md border border-dashed border-border/80 px-3 py-2 text-xs text-muted-foreground">
    {label}
  </div>
)

type StatusRowProps = {
  children: ReactNode
  dotClassName: string
  meta?: string
}

export const StatusRow = ({ children, dotClassName, meta }: StatusRowProps) => (
  <div className="flex min-w-0 items-start gap-2 rounded-md border border-border/70 bg-background/70 px-3 py-2">
    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotClassName}`} />
    <div className="min-w-0 flex-1">
      <div className="truncate text-xs text-foreground">{children}</div>
      {meta && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta}</div>}
    </div>
  </div>
)
