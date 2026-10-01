import type { ComponentType, ReactNode, SVGProps } from 'react'
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '@/components/ui/sidebar'
import { cn } from '@/lib/utils'

type SidebarPanelId = 'explorer' | 'graph' | 'projects' | 'search'

export const sidebarPanelControlClassName =
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-sidebar-ring active:bg-sidebar-accent active:text-sidebar-accent-foreground'

type SidebarPanelFrameProps = {
  actions?: ReactNode
  ariaLabel: string
  children: ReactNode
  className?: string
  contentClassName?: string
  icon?: ComponentType<SVGProps<SVGSVGElement>>
  panel: SidebarPanelId
  title: ReactNode
}

const SidebarPanelFrame = ({
  actions,
  ariaLabel,
  children,
  className,
  contentClassName,
  icon: Icon,
  panel,
  title,
}: SidebarPanelFrameProps) => (
  <SidebarGroup
    aria-label={ariaLabel}
    role="region"
    data-sidebar-panel={panel}
    className={cn('flex min-h-0 flex-col p-0', className)}
  >
    <div className="flex h-8 shrink-0 items-center gap-1 px-1">
      <SidebarGroupLabel
        asChild
        className="h-8 min-w-0 flex-1 gap-1.5 truncate px-1 text-xs font-medium"
      >
        <h2 aria-label={ariaLabel}>
          {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
          <span className="min-w-0 truncate">{title}</span>
        </h2>
      </SidebarGroupLabel>
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </div>
    <SidebarGroupContent className={cn('flex min-h-0 flex-col gap-2 px-1', contentClassName)}>
      {children}
    </SidebarGroupContent>
  </SidebarGroup>
)

export default SidebarPanelFrame
