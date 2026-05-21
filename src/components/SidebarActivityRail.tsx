import {
  FileSearch,
  Files,
  FolderClock,
  GitBranch,
  GitGraph,
  Home,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
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
          variant="ghost"
          size="icon"
          className={`relative h-9 w-9 rounded-md ${
            active
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-sidebar-foreground/70'
          }`}
          aria-label={label}
          data-active={active ? 'true' : 'false'}
          onClick={onClick}
        >
          <Icon className="h-4 w-4" />
          {badge ? (
            <span className="absolute right-0.5 top-0.5 min-w-3.5 rounded-full bg-primary px-1 text-[9px] leading-3.5 text-primary-foreground">
              {badge > 99 ? '99' : badge}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
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
    <TooltipProvider>
      <div className="flex h-full w-12 shrink-0 flex-col items-center border-r border-sidebar-border/80 bg-sidebar/95 py-1.5">
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
