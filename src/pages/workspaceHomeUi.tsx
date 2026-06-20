import { ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

type PanelProps = {
  title: ReactNode
  subtitle: ReactNode
  children: ReactNode
}

export const Panel = ({ title, subtitle, children }: PanelProps) => (
  <Card className="gap-3 py-5">
    <CardHeader className="px-5">
      <CardTitle className="text-sm">{title}</CardTitle>
      <CardDescription className="text-xs">{subtitle}</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-2 px-5">{children}</CardContent>
  </Card>
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
    className="h-auto min-h-12 cursor-pointer justify-start rounded-lg p-4 text-left"
    disabled={disabled}
    onClick={onClick}
  >
    {icon}
    <span className="min-w-0 flex-1 truncate text-left">{children}</span>
    <ArrowRight className="ml-auto text-muted-foreground" data-icon="inline-end" />
  </Button>
)

type ListButtonProps = {
  children: ReactNode
  onClick: () => void
}

export const ListButton = ({ children, onClick }: ListButtonProps) => (
  <Button
    variant="ghost"
    className="h-auto min-h-11 cursor-pointer justify-start rounded-lg px-3 py-2 text-left"
    onClick={onClick}
  >
    {children}
  </Button>
)

export const EmptyBlock = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-24 items-center rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
    {children}
  </div>
)
