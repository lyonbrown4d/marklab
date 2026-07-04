import {
  FileSearch,
  Files,
  FolderClock,
  GitBranch,
  GitGraph,
  Home,
  type LucideIcon,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import type { SidebarActivityId } from '@/logic/routing'

type SidebarActivityItem = {
  id: SidebarActivityId
  label: string
  icon: LucideIcon
  badge?: number
}

type SidebarActivityRailProps = {
  activeActivity: SidebarActivityId
  fileCount: number
  recentProjectCount: number
  onSelectActivity: (activity: SidebarActivityId) => void
  onUseInternalRoot: () => void
}

const ActivityButton = ({
  active,
  badge,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean
  badge?: number
  icon: LucideIcon
  label: string
  onClick: () => void
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            'relative size-9 rounded-lg text-sidebar-foreground/65 transition-colors duration-150',
            'hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-sidebar',
            active &&
              'bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border/80',
          )}
          aria-current={active ? 'page' : undefined}
          aria-label={label}
          data-active={active ? 'true' : 'false'}
          onClick={onClick}
        >
          <span
            aria-hidden="true"
            className={cn(
              'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary opacity-0 transition-opacity',
              active && 'opacity-100',
            )}
          />
          <Icon aria-hidden="true" />
          {badge ? (
            <Badge className="pointer-events-none absolute -right-0.5 -top-0.5 h-3.5 min-w-3.5 rounded-full px-1 text-[9px] leading-none shadow-sm shadow-background/40">
              {badge > 99 ? '99' : badge}
            </Badge>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const SidebarActivityRail = ({
  activeActivity,
  fileCount,
  recentProjectCount,
  onSelectActivity,
  onUseInternalRoot,
}: SidebarActivityRailProps) => {
  const { t } = useI18n()
  const activities: SidebarActivityItem[] = [
    {
      id: 'explorer',
      label: t('sidebar.files'),
      icon: Files,
      badge: fileCount,
    },
    {
      id: 'search',
      label: t('sidebar.searchAction'),
      icon: FileSearch,
    },
    {
      id: 'scm',
      label: t('scm.title'),
      icon: GitBranch,
    },
    {
      id: 'graph',
      label: t('tabs.workspaceGraph'),
      icon: GitGraph,
    },
    {
      id: 'projects',
      label: t('sidebar.recentProjects'),
      icon: FolderClock,
      badge: recentProjectCount,
    },
  ]

  return (
    <TooltipProvider delayDuration={180}>
      <div className="flex h-full w-12 shrink-0 flex-col items-center border-r border-sidebar-border/80 bg-sidebar py-1.5">
        <ActivityButton
          active={false}
          icon={Home}
          label={t('sidebar.localWorkspace')}
          onClick={onUseInternalRoot}
        />
        <Separator className="my-1.5 w-7 bg-sidebar-border/70" />
        <div className="flex min-h-0 flex-1 flex-col items-center gap-1">
          {activities.map((activity) => (
            <ActivityButton
              key={activity.id}
              active={activity.id === activeActivity}
              badge={activity.badge}
              icon={activity.icon}
              label={activity.label}
              onClick={() => onSelectActivity(activity.id)}
            />
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}

export default SidebarActivityRail
