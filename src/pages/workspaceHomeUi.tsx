import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'

type PanelProps = {
  title: string
  subtitle: string
  children: ReactNode
}

export const Panel = ({ title, subtitle, children }: PanelProps) => (
  <div className="rounded-lg border border-border/80 bg-background p-5 shadow-sm">
    <div className="mb-4">
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">{subtitle}</div>
    </div>
    <div className="grid gap-2">{children}</div>
  </div>
)

type QuickButtonProps = {
  children: ReactNode
  disabled?: boolean
  icon: ReactNode
  onClick: () => void
}

export const QuickButton = ({ children, disabled, icon, onClick }: QuickButtonProps) => (
  <Button
    variant="secondary"
    className="h-auto justify-start rounded-md p-4"
    disabled={disabled}
    onClick={onClick}
  >
    {icon}
    <span className="min-w-0 truncate text-left">{children}</span>
    <ArrowRight className="ml-auto h-4 w-4" />
  </Button>
)

type ListButtonProps = {
  children: ReactNode
  onClick: () => void
}

export const ListButton = ({ children, onClick }: ListButtonProps) => (
  <Button
    variant="ghost"
    className="h-auto justify-start rounded-md px-3 py-2 text-left"
    onClick={onClick}
  >
    {children}
  </Button>
)

export const EmptyBlock = ({ children }: { children: ReactNode }) => (
  <div className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
    {children}
  </div>
)
