import { AppWindow, ArrowUpRight, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/AppTooltip'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

export const PreviewFailure = ({
  interactionClassName,
  onRetry,
}: {
  interactionClassName?: string
  onRetry: () => void
}) => {
  const { t } = useI18n()
  return (
    <span
      className={cn(
        'absolute left-2 top-2 flex items-center gap-1 rounded-md border border-border/70 bg-background/90 p-1 pl-2 text-[11px] text-muted-foreground shadow-sm backdrop-blur-sm',
        interactionClassName,
      )}
      role="alert"
    >
      <span>{t('preview.externalFailed')}</span>
      <Button
        className="h-6 gap-1 rounded px-1.5 text-[11px]"
        size="sm"
        type="button"
        variant="ghost"
        onClick={onRetry}
      >
        <RefreshCw aria-hidden className="size-3" />
        {t('actions.retry')}
      </Button>
    </span>
  )
}

export const PreviewOpenAction = ({
  interactionClassName,
  onOpen,
}: {
  interactionClassName?: string
  onOpen: () => void
}) => {
  const { t } = useI18n()
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            aria-label={t('preview.openInApp')}
            className={cn(
              'absolute right-2 top-2 size-7 rounded-md border-border/70 bg-background/80 text-muted-foreground opacity-85 shadow-sm backdrop-blur-sm transition-[opacity,color,transform] hover:text-foreground group-hover/link-card:opacity-100 motion-reduce:transform-none',
              interactionClassName,
            )}
            size="icon"
            type="button"
            variant="outline"
            onClick={onOpen}
          >
            <AppWindow aria-hidden className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('preview.openInApp')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

export const PreviewFooter = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <span className="flex items-center gap-1.5 border-t border-border/60 px-3 py-2 text-[11px] font-medium text-muted-foreground">
    {icon}
    <span className="truncate">{label}</span>
    <ArrowUpRight aria-hidden className="ml-auto size-3 opacity-60" />
  </span>
)
