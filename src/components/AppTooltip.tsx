import { useCallback, useEffect, useState, type ComponentProps } from 'react'

import {
  Tooltip,
  TooltipContent as ShadcnTooltipContent,
  TooltipProvider as ShadcnTooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type TooltipProps = ComponentProps<typeof Tooltip>
type TooltipContentProps = ComponentProps<typeof ShadcnTooltipContent>

type TooltipProviderProps = ComponentProps<typeof ShadcnTooltipProvider>

const TooltipProvider = ({
  delayDuration = 180,
  skipDelayDuration = 120,
  ...props
}: TooltipProviderProps) => (
  <ShadcnTooltipProvider
    delayDuration={delayDuration}
    skipDelayDuration={skipDelayDuration}
    {...props}
  />
)

const AppTooltip = ({ defaultOpen, onOpenChange, open, ...props }: TooltipProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen ?? false)
  const resolvedOpen = open ?? uncontrolledOpen
  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (open === undefined) setUncontrolledOpen(nextOpen)
      onOpenChange?.(nextOpen)
    },
    [onOpenChange, open],
  )

  useEffect(() => {
    if (!resolvedOpen) return
    const close = () => handleOpenChange(false)
    const closeWhenHidden = () => {
      if (document.visibilityState === 'hidden') close()
    }
    window.addEventListener('blur', close)
    window.addEventListener('pagehide', close)
    document.addEventListener('visibilitychange', closeWhenHidden)
    return () => {
      window.removeEventListener('blur', close)
      window.removeEventListener('pagehide', close)
      document.removeEventListener('visibilitychange', closeWhenHidden)
    }
  }, [handleOpenChange, resolvedOpen])

  return <Tooltip onOpenChange={handleOpenChange} open={resolvedOpen} {...props} />
}

const TooltipContent = ({
  className,
  collisionPadding = 8,
  sideOffset = 6,
  ...props
}: TooltipContentProps) => (
  <ShadcnTooltipContent
    className={cn('motion-reduce:animate-none', className)}
    collisionPadding={collisionPadding}
    sideOffset={sideOffset}
    {...props}
  />
)

export { AppTooltip as Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
