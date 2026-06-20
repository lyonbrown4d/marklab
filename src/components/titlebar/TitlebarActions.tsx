import { FileText, FolderOpen, PanelRight, Search, Settings2 } from 'lucide-react'
import TitlebarLanguageMenu from '@/components/TitlebarLanguageMenu'
import TitlebarThemeMenu from '@/components/TitlebarThemeMenu'
import { Button } from '@/components/ui/button'
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

  return (
    <div className="flex items-center gap-0.5">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="chrome-button h-8 w-8 rounded-md"
            onClick={onSelectProject}
            aria-label={t('actions.openProject')}
          >
            <FolderOpen className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.openProject')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="chrome-button h-8 w-8 rounded-md"
            onClick={onSelectSingleFile}
            aria-label={t('actions.openFile')}
          >
            <FileText className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.openFile')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="chrome-button h-8 w-8 rounded-md md:hidden"
            onClick={onOpenSearch}
            aria-label={t('sidebar.searchAction')}
          >
            <Search className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('sidebar.searchAction')}</TooltipContent>
      </Tooltip>
      <TitlebarThemeMenu
        theme={theme}
        setTheme={setTheme}
        onAbout={() => onMenuAction('help.about')}
      />
      <TitlebarLanguageMenu />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="chrome-button h-8 w-8 rounded-md"
            onClick={onOpenSettings}
            aria-label={t('menu.settings')}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('menu.settings')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="chrome-button h-8 w-8 rounded-md"
            onClick={onToggleRightSidebar}
            aria-label={t('actions.toggleRightSidebar')}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('actions.toggleRightSidebar')}</TooltipContent>
      </Tooltip>
    </div>
  )
}
