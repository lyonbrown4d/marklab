import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'

type SettingsButtonProps = ComponentProps<typeof Button>

export const SettingsEmptyState = ({
  children,
  className,
  role = 'note',
  ...props
}: ComponentProps<'div'>) => {
  return (
    <Empty
      role={role}
      className={cn(
        'min-h-0 flex-none gap-0 rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      <EmptyHeader className="max-w-none items-stretch gap-0 text-inherit">
        <EmptyTitle
          aria-level={3}
          className="text-inherit text-xs leading-5 font-normal"
          role="heading"
        >
          {children}
        </EmptyTitle>
      </EmptyHeader>
    </Empty>
  )
}

export const SettingsActionButton = ({
  size = 'sm',
  variant = 'secondary',
  className,
  ...props
}: SettingsButtonProps) => {
  return (
    <Button
      {...props}
      size={size}
      variant={variant}
      className={cn('border-border/70 transition-colors hover:border-primary/40', className)}
    />
  )
}

export const SettingsIconButton = ({
  size = 'icon',
  variant = 'ghost',
  className,
  ...props
}: SettingsButtonProps) => {
  return (
    <Button
      {...props}
      size={size}
      variant={variant}
      className={cn(
        'text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground focus-visible:bg-foreground/[0.08] focus-visible:text-foreground',
        className,
      )}
    />
  )
}
