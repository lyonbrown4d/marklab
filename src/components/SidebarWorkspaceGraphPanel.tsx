import { GitGraph } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
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
    <SidebarGroup className="rounded-lg border border-sidebar-border/60 bg-sidebar/45 p-1.5">
      <SidebarGroupLabel className="flex h-auto items-center justify-between gap-2 px-1.5 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <GitGraph aria-hidden="true" className="size-3.5" />
          </div>
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground">
            {t('tabs.workspaceGraph')}
          </span>
        </div>
      </SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-2 px-1 pb-1">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-full justify-start rounded-md px-2 text-xs"
          onClick={onOpenWorkspaceGraph}
        >
          <GitGraph aria-hidden="true" />
          {t('tabs.workspaceGraph')}
        </Button>
        <Separator className="bg-sidebar-border/70" />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex min-w-0 flex-col gap-1 rounded-md border border-sidebar-border/70 bg-background/55 px-2 py-2 transition-colors hover:bg-sidebar-accent/50">
            <div className="text-[10px] uppercase text-muted-foreground">{t('sidebar.files')}</div>
            <Badge variant="secondary" className="w-fit rounded px-1.5 py-0 text-[10px]">
              {fileCount}
            </Badge>
          </div>
          <div className="flex min-w-0 flex-col gap-1 rounded-md border border-sidebar-border/70 bg-background/55 px-2 py-2 transition-colors hover:bg-sidebar-accent/50">
            <div className="text-[10px] uppercase text-muted-foreground">
              {t('sidebar.recentProjects')}
            </div>
            <Badge variant="secondary" className="w-fit rounded px-1.5 py-0 text-[10px]">
              {recentProjects.length}
            </Badge>
          </div>
        </div>
        {rootPath && (
          <TooltipProvider delayDuration={180}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="truncate rounded-md border border-sidebar-border/70 bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                  {rootPath}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-80 break-all">
                {rootPath}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export default SidebarWorkspaceGraphPanel
