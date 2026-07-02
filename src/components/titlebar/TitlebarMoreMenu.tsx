import { CircleHelp, FileText, FolderOpen, Languages, MoreHorizontal, Palette } from 'lucide-react'

import { TitlebarIconButton } from '@/components/titlebar/TitlebarIconButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { builtInThemes } from '@/logic/themes'
import type { ThemeMode, ThemeModePreference } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type TitlebarMoreMenuProps = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  onAbout: () => void
  onSelectProject: () => void
  onSelectSingleFile: () => void
}

export const TitlebarMoreMenu = ({
  theme,
  setTheme,
  onAbout,
  onSelectProject,
  onSelectSingleFile,
}: TitlebarMoreMenuProps) => {
  const { t, locale, setLocale } = useI18n()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TitlebarIconButton aria-label={t('actions.more')}>
          <MoreHorizontal aria-hidden="true" data-icon="icon" />
        </TitlebarIconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onSelectProject}>
            <FolderOpen aria-hidden="true" />
            {t('actions.openProject')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onSelectSingleFile}>
            <FileText aria-hidden="true" />
            {t('actions.openFile')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette aria-hidden="true" />
              {t('menu.theme')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuLabel>{t('menu.theme')}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={themeMode}
                onValueChange={(value) => setThemeMode(value as ThemeModePreference)}
              >
                <DropdownMenuRadioItem value="system">
                  {t('themeMode.system')}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">{t('themeMode.light')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t('themeMode.dark')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
                {t('settings.themePreset')}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as ThemeMode)}
              >
                {builtInThemes.map((item) => (
                  <DropdownMenuRadioItem key={item.value} value={item.value}>
                    {t(item.labelKey)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Languages aria-hidden="true" />
              {t('menu.language')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuRadioGroup
                value={locale}
                onValueChange={(value) => setLocale(value as Locale)}
              >
                <DropdownMenuRadioItem value="zh-CN">{t('language.zh')}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en-US">{t('language.en')}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onAbout}>
            <CircleHelp aria-hidden="true" />
            {t('actions.about')}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
