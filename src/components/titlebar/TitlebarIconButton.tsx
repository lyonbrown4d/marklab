import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TitlebarIconButtonProps = ComponentPropsWithoutRef<typeof Button>

export const TitlebarIconButton = forwardRef<ElementRef<typeof Button>, TitlebarIconButtonProps>(
  ({ className, variant = 'ghost', size = 'icon', type = 'button', ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type={type}
        variant={variant}
        size={size}
        className={cn(
          'chrome-button size-8 rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground active:bg-muted',
          className,
        )}
        {...props}
      />
    )
  },
)

TitlebarIconButton.displayName = 'TitlebarIconButton'
