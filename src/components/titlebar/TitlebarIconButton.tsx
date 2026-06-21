import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TitlebarIconButtonProps = ComponentPropsWithoutRef<typeof Button>

export const TitlebarIconButton = forwardRef<ElementRef<typeof Button>, TitlebarIconButtonProps>(
  ({ className, variant = 'ghost', size = 'icon', ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn(
          'chrome-button size-8 rounded-md text-muted-foreground hover:text-foreground',
          className,
        )}
        {...props}
      />
    )
  },
)

TitlebarIconButton.displayName = 'TitlebarIconButton'
