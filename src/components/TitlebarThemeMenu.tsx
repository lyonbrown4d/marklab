import { CircleHelp, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/useI18n'
import type { ThemeMode, ThemeModePreference } from '@/store/appTypes'
import { builtInThemes } from '@/logic/themes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type TitlebarThemeMenuProps = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  onAbout: () => void
}

const TitlebarThemeMenu = ({ theme, setTheme, onAbout }: TitlebarThemeMenuProps) => {
  const { t } = useI18n()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="chrome-button h-8 w-8 rounded-md"
          aria-label={t('menu.theme')}
        >
          <Palette className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{t('menu.theme')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={themeMode}
          onValueChange={(value) => setThemeMode(value as ThemeModePreference)}
        >
          <DropdownMenuRadioItem value="system">{t('themeMode.system')}</DropdownMenuRadioItem>
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
        <DropdownMenuSeparator />
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onAbout}>
          <CircleHelp className="mr-2 h-3.5 w-3.5" />
          About marklab
        </Button>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TitlebarThemeMenu
