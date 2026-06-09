import { CircleHelp, GitGraph, Languages, Palette, PenLine } from 'lucide-react'
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
import type { Locale } from '@/i18n/resources'
import type { ThemeMode } from '@/store/appTypes'

type TitlebarThemeMenuProps = {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  onAbout: () => void
}

const TitlebarThemeMenu = ({ theme, setTheme, onAbout }: TitlebarThemeMenuProps) => {
  const { t, locale, setLocale } = useI18n()

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
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('menu.theme')}</DropdownMenuLabel>
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {t('theme.groupShadcn')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeMode)}
        >
          <DropdownMenuRadioItem value="light">{t('theme.light')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">{t('theme.dark')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">
          {t('theme.groupMarko')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value as ThemeMode)}
        >
          <DropdownMenuRadioItem value="marko-light">
            <PenLine className="mr-1 h-3.5 w-3.5" />
            {t('theme.markoLight')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="marko-dark">
            <GitGraph className="mr-1 h-3.5 w-3.5" />
            {t('theme.markoDark')}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => setLocale(value as Locale)}
        >
          <DropdownMenuRadioItem value="zh-CN">
            <Languages className="mr-1 h-3.5 w-3.5" />
            {t('language.zh')}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">
            <Languages className="mr-1 h-3.5 w-3.5" />
            {t('language.en')}
          </DropdownMenuRadioItem>
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
