import { PanelLeft } from 'lucide-react'
import AppLogo from '@/components/AppLogo'
import AppMenuBar from '@/components/AppMenuBar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import type { TitlebarMenuGroup } from '@/components/titlebar/titlebarTypes'

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

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSidebar}
            aria-label={t('actions.toggleSidebar')}
            className="chrome-button h-8 w-8 rounded-md"
          >
            <PanelLeft className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.toggleSidebar')}</TooltipContent>
      </Tooltip>
      <div className="flex min-w-0 items-center gap-2 px-1 leading-none">
        <AppLogo className="h-6 w-6" />
        <div className="truncate text-sm font-semibold tracking-[0.01em]">{t('app.name')}</div>
      </div>
      {showInlineMenu && <AppMenuBar groups={menuGroups} onAction={onMenuAction} />}
    </div>
  )
}
