import type { ComponentProps } from 'react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider as ShadcnTooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

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

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
