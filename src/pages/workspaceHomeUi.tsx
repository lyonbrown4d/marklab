import { ArrowRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

type PanelProps = {
  title: ReactNode
  subtitle: ReactNode
  children: ReactNode
}

export const Panel = ({ title, subtitle, children }: PanelProps) => (
  <Card className="gap-3 border-border/70 bg-card/80 py-5 shadow-none">
    <CardHeader className="px-5">
      <CardTitle className="text-sm">{title}</CardTitle>
      <CardDescription className="text-xs">{subtitle}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-2 px-5">{children}</CardContent>
  </Card>
)

type WorkspaceMetricCardProps = {
  caption: ReactNode
  icon: LucideIcon
  label: ReactNode
  loading?: boolean
  loadingLabel?: string
  tone?: 'default' | 'danger'
  value: ReactNode
}

export const WorkspaceMetricCard = ({
  caption,
  icon: Icon,
  label,
  loading,
  loadingLabel,
  tone = 'default',
  value,
}: WorkspaceMetricCardProps) => (
  <Card className="gap-0 border-border/70 bg-card/80 py-0 shadow-none transition-colors duration-200 hover:border-border">
    <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 pt-4 pb-0">
      <div
        className={cn(
          'rounded-md bg-muted p-2 text-muted-foreground',
          tone === 'danger' && 'text-destructive',
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <CardTitle className="text-right text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </CardTitle>
    </CardHeader>
    <CardContent className="p-4">
      {loading ? (
        <div aria-label={loadingLabel} role="status">
          <Skeleton className="h-9 w-20" />
        </div>
      ) : (
        <div className="text-3xl font-semibold tracking-tight">{value}</div>
      )}
      <div className="mt-1 text-xs text-muted-foreground">{caption}</div>
    </CardContent>
  </Card>
)

type QuickButtonProps = {
  children: ReactNode
  disabled?: boolean
  icon: LucideIcon
  onClick: () => void
}

export const QuickButton = ({ children, disabled, icon: Icon, onClick }: QuickButtonProps) => (
  <Button
    variant="secondary"
    className="h-auto min-h-12 cursor-pointer justify-start rounded-md p-4 text-left transition-colors duration-200"
    disabled={disabled}
    onClick={onClick}
  >
    <Icon data-icon="inline-start" />
    <span className="min-w-0 flex-1 truncate text-left">{children}</span>
    <ArrowRight data-icon="inline-end" />
  </Button>
)

type ListButtonProps = {
  description: ReactNode
  icon: LucideIcon
  onClick: () => void
  title: ReactNode
}

export const ListButton = ({ description, icon: Icon, onClick, title }: ListButtonProps) => (
  <Button
    variant="ghost"
    className="h-auto min-h-11 cursor-pointer justify-start rounded-md px-3 py-2 text-left transition-colors duration-200"
    onClick={onClick}
  >
    <Icon className="shrink-0 text-muted-foreground" data-icon="inline-start" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm">{title}</span>
      <span className="block truncate text-xs text-muted-foreground">{description}</span>
    </span>
  </Button>
)

type EmptyBlockProps = {
  children: ReactNode
  icon: LucideIcon
}

export const EmptyBlock = ({ children, icon: Icon }: EmptyBlockProps) => (
  <Empty className="min-h-24 flex-none gap-3 rounded-md border border-dashed border-border/80 bg-muted/20 p-4">
    <EmptyHeader className="gap-2">
      <EmptyMedia variant="icon" className="size-9">
        <Icon aria-hidden="true" />
      </EmptyMedia>
      <EmptyDescription className="text-xs leading-5">{children}</EmptyDescription>
    </EmptyHeader>
  </Empty>
)
