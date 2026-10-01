import { FolderOpen } from 'lucide-react'
import AppEmptyState from '@/components/AppEmptyState'
import SidebarPanelFrame, { sidebarPanelControlClassName } from '@/components/SidebarPanelFrame'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarMenu, SidebarMenuItem } from '@/components/ui/sidebar'
import type { SidebarProjectsPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'

const SidebarProjectsPanel = ({
  onOpenProject,
  onSelectProject,
  onUseInternalRoot,
  recentProjects,
}: SidebarProjectsPanelProps) => {
  const { t } = useI18n()

  return (
    <SidebarPanelFrame
      panel="projects"
      ariaLabel={t('sidebar.recentProjects')}
      title={t('sidebar.recentProjects')}
      actions={
        <Badge variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
          {recentProjects.length}
        </Badge>
      }
    >
      <SidebarMenu>
        <SidebarMenuItem>
          <Button
            variant="secondary"
            size="sm"
            className={`${sidebarPanelControlClassName} h-8 w-full justify-start rounded-md px-2`}
            onClick={onSelectProject}
          >
            <FolderOpen data-icon="inline-start" />
            <span className="truncate text-xs">{t('actions.openProject')}</span>
          </Button>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <Button
            variant="ghost"
            size="sm"
            className={`${sidebarPanelControlClassName} h-8 w-full justify-start rounded-md px-2 text-sidebar-foreground/85`}
            onClick={onUseInternalRoot}
          >
            <FolderOpen data-icon="inline-start" />
            <span className="truncate text-xs">{t('sidebar.localWorkspace')}</span>
          </Button>
        </SidebarMenuItem>
        {recentProjects.length === 0 && (
          <SidebarMenuItem>
            <AppEmptyState
              compact
              className="mx-1 min-h-20 flex-none border-sidebar-border/70 bg-sidebar/35 px-3 py-3 md:p-3"
              icon={<FolderOpen />}
              mediaClassName="mb-0 size-8 border border-sidebar-border bg-background/70 text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
              role="note"
              title={t('sidebar.noRecentProjects')}
              titleClassName="text-[11px] font-normal text-muted-foreground"
              titleLevel={3}
            />
          </SidebarMenuItem>
        )}
        {recentProjects.map((path) => (
          <SidebarMenuItem key={path}>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('workspace.openRecentInNewWindow', { name: path })}
              className={`${sidebarPanelControlClassName} h-8 w-full justify-start rounded-md px-2 text-sidebar-foreground/85`}
              onClick={() => onOpenProject(path)}
            >
              <FolderOpen data-icon="inline-start" />
              <span className="truncate text-xs">{path}</span>
            </Button>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarPanelFrame>
  )
}

export default SidebarProjectsPanel
