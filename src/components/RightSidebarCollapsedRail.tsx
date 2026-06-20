import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import { LayoutGrid, NotebookTabs } from 'lucide-react'

type RightSidebarCollapsedRailProps = {
  tabs: string[]
  totalFiles: number
}

export const RightSidebarCollapsedRail = ({ tabs, totalFiles }: RightSidebarCollapsedRailProps) => {
  const { t } = useI18n()
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col items-center gap-2 pt-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="right-rail-stat" role="img" aria-label={t('inspector.totalFiles')}>
              <LayoutGrid className="size-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            {t('inspector.totalFiles')}: {totalFiles}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="right-rail-stat" role="img" aria-label={t('inspector.openTabs')}>
              <NotebookTabs className="size-4" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            {t('inspector.openTabs')}: {tabs.length}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
