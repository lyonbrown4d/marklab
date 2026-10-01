import { GitGraph } from 'lucide-react'
import SidebarPanelFrame, { sidebarPanelControlClassName } from '@/components/SidebarPanelFrame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { SidebarWorkspaceGraphPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'

const SidebarWorkspaceGraphPanel = ({
  fileCount,
  onOpenWorkspaceGraph,
  recentProjects,
  rootPath,
}: SidebarWorkspaceGraphPanelProps) => {
  const { t } = useI18n()

  return (
    <SidebarPanelFrame
      panel="graph"
      ariaLabel={t('tabs.workspaceGraph')}
      icon={GitGraph}
      title={t('tabs.workspaceGraph')}
    >
      <Button
        variant="secondary"
        size="sm"
        className={`${sidebarPanelControlClassName} h-8 w-full justify-start rounded-md px-2 text-xs`}
        onClick={onOpenWorkspaceGraph}
      >
        <GitGraph aria-hidden="true" />
        {t('tabs.workspaceGraph')}
      </Button>
      <Separator className="bg-sidebar-border/70" />
      <dl className="flex flex-col text-xs">
        <div className="flex h-8 min-w-0 items-center justify-between gap-2 px-2">
          <dt className="truncate text-muted-foreground">{t('sidebar.files')}</dt>
          <Badge variant="secondary" className="w-fit rounded px-1.5 py-0 text-[10px]">
            {fileCount}
          </Badge>
        </div>
        <div className="flex h-8 min-w-0 items-center justify-between gap-2 px-2">
          <dt className="truncate text-muted-foreground">{t('sidebar.recentProjects')}</dt>
          <Badge variant="secondary" className="w-fit rounded px-1.5 py-0 text-[10px]">
            {recentProjects.length}
          </Badge>
        </div>
      </dl>
      {rootPath && (
        <TooltipProvider delayDuration={180}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="truncate px-2 py-1.5 text-[11px] text-muted-foreground">
                {rootPath}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-80 break-all">
              {rootPath}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </SidebarPanelFrame>
  )
}

export default SidebarWorkspaceGraphPanel
