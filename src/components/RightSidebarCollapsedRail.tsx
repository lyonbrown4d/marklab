import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { LayoutGrid, NotebookTabs, type LucideIcon } from 'lucide-react'

type RightSidebarCollapsedRailProps = {
  tabs: string[]
  totalFiles: number
}

const CollapsedMetric = ({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: number
}) => {
  const displayValue = value > 99 ? '99+' : String(value)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'flex w-9 flex-col items-center gap-1 rounded-md border border-transparent px-1 py-1.5 text-muted-foreground',
            'transition-colors duration-150 hover:border-sidebar-border/70 hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground',
          )}
          aria-label={`${label}: ${value}`}
        >
          <Icon className="size-4" aria-hidden="true" />
          <span className="max-w-8 truncate text-[10px] font-medium leading-none tabular-nums">
            {displayValue}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="left">
        {label}: {value}
      </TooltipContent>
    </Tooltip>
  )
}

export const RightSidebarCollapsedRail = ({ tabs, totalFiles }: RightSidebarCollapsedRailProps) => {
  const { t } = useI18n()
  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-full flex-col items-center gap-1.5 pt-2">
        <CollapsedMetric icon={LayoutGrid} label={t('inspector.totalFiles')} value={totalFiles} />
        <CollapsedMetric icon={NotebookTabs} label={t('inspector.openTabs')} value={tabs.length} />
      </div>
    </TooltipProvider>
  )
}
