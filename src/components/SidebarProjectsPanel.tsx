import { FolderOpen } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { SidebarProjectsPanelProps } from '@/components/sidebarPanelTypes'
import { useI18n } from '@/i18n/useI18n'

const SidebarProjectsPanel = ({
  onOpenProject,
  onUseInternalRoot,
  recentProjects,
}: SidebarProjectsPanelProps) => {
  const { t } = useI18n()

  return (
    <SidebarGroup className="sidebar-section rounded-md p-1">
      <SidebarGroupLabel className="sidebar-section-header flex h-8 items-center justify-between px-2 text-[11px] uppercase">
        <span>{t('sidebar.recentProjects')}</span>
        <Badge variant="secondary" className="rounded px-1.5 py-0">
          {recentProjects.length}
        </Badge>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-full justify-start rounded-md px-2 text-sidebar-foreground/85 hover:bg-sidebar-accent"
              onClick={onUseInternalRoot}
            >
              <FolderOpen className="h-4 w-4 text-primary" />
              <span className="truncate text-xs">{t('sidebar.localWorkspace')}</span>
            </Button>
          </SidebarMenuItem>
          {recentProjects.length === 0 && (
            <SidebarMenuItem>
              <div className="px-2 py-1 text-xs text-muted-foreground">
                {t('sidebar.noRecentProjects')}
              </div>
            </SidebarMenuItem>
          )}
          {recentProjects.map((path) => (
            <SidebarMenuItem key={path}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start rounded-md px-2 text-sidebar-foreground/85 hover:bg-sidebar-accent"
                onClick={() => onOpenProject(path)}
              >
                <FolderOpen className="h-4 w-4 text-primary" />
                <span className="truncate text-xs">{path}</span>
              </Button>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export default SidebarProjectsPanel
