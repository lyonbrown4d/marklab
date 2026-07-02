import { PanelLeft } from 'lucide-react'

import AppLogo from '@/components/AppLogo'
import AppMenuBar from '@/components/AppMenuBar'
import { TitlebarIconButton } from '@/components/titlebar/TitlebarIconButton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'

type TitlebarMenuItem = {
  id: string
  label: string
  disabled?: boolean
}

type TitlebarMenuGroup = {
  label: string
  items: TitlebarMenuItem[]
}

type TitlebarNavigationProps = {
  showInlineMenu: boolean
  menuGroups: TitlebarMenuGroup[]
  onMenuAction: (id: string) => void
  onToggleSidebar: () => void
}

export const TitlebarNavigation = ({
  showInlineMenu,
  menuGroups,
  onMenuAction,
  onToggleSidebar,
}: TitlebarNavigationProps) => {
  const { t } = useI18n()
  const toggleSidebarLabel = t('actions.toggleSidebar')

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <TitlebarIconButton aria-label={toggleSidebarLabel} onClick={onToggleSidebar}>
            <PanelLeft aria-hidden="true" data-icon="icon" />
          </TitlebarIconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{toggleSidebarLabel}</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 items-center gap-2 px-1">
        <AppLogo className="size-6 shrink-0" />
        <span className="hidden max-w-28 truncate text-sm font-semibold tracking-[-0.01em] text-foreground sm:block">
          MarkLab
        </span>
      </div>

      {showInlineMenu ? <AppMenuBar groups={menuGroups} onAction={onMenuAction} /> : null}
    </div>
  )
}
