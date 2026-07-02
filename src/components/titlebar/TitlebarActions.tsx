import { PanelRight, Search, Settings2 } from 'lucide-react'

import { TitlebarIconButton } from '@/components/titlebar/TitlebarIconButton'
import { TitlebarMoreMenu } from '@/components/titlebar/TitlebarMoreMenu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n/useI18n'
import type { ThemeMode } from '@/store/appTypes'

type TitlebarActionsProps = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  onMenuAction: (id: string) => void
  onOpenSearch: () => void
  onOpenSettings: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
  onToggleRightSidebar: () => void
}

export const TitlebarActions = ({
  theme,
  setTheme,
  onMenuAction,
  onOpenSearch,
  onOpenSettings,
  onSelectProject,
  onSelectSingleFile,
  onToggleRightSidebar,
}: TitlebarActionsProps) => {
  const { t } = useI18n()
  const searchLabel = t('sidebar.searchAction')
  const settingsLabel = t('menu.settings')
  const toggleInspectorLabel = t('actions.toggleRightSidebar')

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <TitlebarIconButton aria-label={searchLabel} className="md:hidden" onClick={onOpenSearch}>
            <Search aria-hidden="true" data-icon="icon" />
          </TitlebarIconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{searchLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <TitlebarIconButton aria-label={settingsLabel} onClick={onOpenSettings}>
            <Settings2 aria-hidden="true" data-icon="icon" />
          </TitlebarIconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{settingsLabel}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <TitlebarIconButton aria-label={toggleInspectorLabel} onClick={onToggleRightSidebar}>
            <PanelRight aria-hidden="true" data-icon="icon" />
          </TitlebarIconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{toggleInspectorLabel}</TooltipContent>
      </Tooltip>

      <TitlebarMoreMenu
        theme={theme}
        setTheme={setTheme}
        onAbout={() => onMenuAction('about')}
        onSelectProject={onSelectProject}
        onSelectSingleFile={onSelectSingleFile}
      />
    </div>
  )
}
