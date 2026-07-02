import { CircleHelp, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const themeModeLabels: Record<ThemeModePreference, string> = {
    system: t('themeMode.system'),
    light: t('themeMode.light'),
    dark: t('themeMode.dark'),
  }
  const themePreset = builtInThemes.find((item) => item.value === theme)
  const themePresetLabel = themePreset ? t(themePreset.labelKey) : t('settings.themePreset')
  const triggerLabel = `${t('menu.theme')} - ${themeModeLabels[themeMode]}, ${themePresetLabel}`

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="chrome-button size-8 rounded-md"
          aria-label={triggerLabel}
          title={triggerLabel}
        >
          <Palette aria-hidden="true" />
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
        <DropdownMenuItem onSelect={onAbout}>
          <CircleHelp aria-hidden="true" />
          <span>{t('actions.about')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TitlebarThemeMenu
