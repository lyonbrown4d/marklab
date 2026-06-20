import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type SettingsButtonProps = ComponentProps<typeof Button>

export const SettingsEmptyState = ({ className, ...props }: ComponentProps<'div'>) => {
  return (
    <div
      className={cn(
        'settings-empty-state rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground',
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
      className={cn('settings-action-button', className)}
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
      className={cn('settings-action-icon-button', className)}
    />
  )
}
