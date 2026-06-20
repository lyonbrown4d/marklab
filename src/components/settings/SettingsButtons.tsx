import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SettingsButtonProps = ComponentProps<typeof Button>

export const SettingsEmptyState = ({ className, ...props }: ComponentProps<'div'>) => {
  return (
    <div
      className={cn(
        'rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
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
