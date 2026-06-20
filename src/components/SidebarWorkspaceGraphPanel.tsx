import { GitGraph } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
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
    <SidebarGroup className="sidebar-section rounded-md p-1">
      <SidebarGroupLabel className="sidebar-section-header flex h-8 items-center justify-between px-2 text-[11px] uppercase">
        <span>{t('tabs.workspaceGraph')}</span>
        <GitGraph className="size-3.5" />
      </SidebarGroupLabel>
      <SidebarGroupContent className="space-y-2 px-1 pb-1">
        <Button
          variant="secondary"
          size="sm"
          className="h-8 w-full justify-start rounded-md px-2 text-xs"
          onClick={onOpenWorkspaceGraph}
        >
          <GitGraph className="size-4" />
          {t('tabs.workspaceGraph')}
        </Button>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border border-sidebar-border/70 bg-muted/30 px-2 py-1.5 transition-colors hover:bg-sidebar-accent/60">
            <div className="text-[10px] uppercase text-muted-foreground">{t('sidebar.files')}</div>
            <div className="font-semibold">{fileCount}</div>
          </div>
          <div className="rounded border border-sidebar-border/70 bg-muted/30 px-2 py-1.5 transition-colors hover:bg-sidebar-accent/60">
            <div className="text-[10px] uppercase text-muted-foreground">
              {t('sidebar.recentProjects')}
            </div>
            <div className="font-semibold">{recentProjects.length}</div>
          </div>
        </div>
        {rootPath && (
          <div className="break-all rounded-md border border-sidebar-border/70 bg-background/60 px-2 py-1.5 text-[11px] text-muted-foreground">
            {rootPath}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export default SidebarWorkspaceGraphPanel
