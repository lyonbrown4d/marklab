import { Languages } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'

const TitlebarLanguageMenu = () => {
  const { t, locale, setLocale } = useI18n()
  const languageLabel = locale === 'zh-CN' ? t('language.zh') : t('language.en')
  const triggerLabel = `${t('menu.language')} - ${languageLabel}`

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
          <Languages aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t('menu.language')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={locale}
          onValueChange={(value) => setLocale(value as Locale)}
        >
          <DropdownMenuRadioItem value="zh-CN">{t('language.zh')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="en-US">{t('language.en')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TitlebarLanguageMenu
