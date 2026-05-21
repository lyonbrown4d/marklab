import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, Languages, Palette } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { useAppStore, type ThemeMode } from '@/store/useAppStore'

const themes: Array<{ value: ThemeMode; labelKey: string; swatchClass: string }> = [
  { value: 'light', labelKey: 'theme.light', swatchClass: 'theme-swatch-light' },
  { value: 'dark', labelKey: 'theme.dark', swatchClass: 'theme-swatch-dark' },
  {
    value: 'marko-light',
    labelKey: 'theme.markoLight',
    swatchClass: 'theme-swatch-marko-light',
  },
  { value: 'marko-dark', labelKey: 'theme.markoDark', swatchClass: 'theme-swatch-marko-dark' },
]

const locales: Array<{ value: Locale; labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'language.zh' },
  { value: 'en-US', labelKey: 'language.en' },
]

const appearanceSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'marko-light', 'marko-dark']),
  locale: z.enum(['zh-CN', 'en-US']),
})

type AppearanceSettingsValues = z.infer<typeof appearanceSettingsSchema>

const AppearanceSettingsPage = () => {
  const { t, locale, setLocale } = useI18n()
  const theme = useAppStore((state) => state.theme)
  const setTheme = useAppStore((state) => state.setTheme)
  const form = useForm<AppearanceSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(appearanceSettingsSchema),
    values: {
      theme,
      locale,
    },
  })

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Palette className="h-4 w-4 text-primary" />
          {t('menu.theme')}
        </div>
        <div className="mb-3 text-xs text-muted-foreground">{t('settings.themeDescription')}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="theme"
            render={({ field }) => (
              <>
                {themes.map((item) => (
                  <Button
                    key={item.value}
                    variant="ghost"
                    data-selected={field.value === item.value ? 'true' : 'false'}
                    className="theme-choice h-auto justify-start gap-3 rounded-md p-2 text-left shadow-none"
                    onClick={() => {
                      field.onChange(item.value)
                      setTheme(item.value)
                    }}
                  >
                    <ThemePreview swatchClass={item.swatchClass} />
                    <span className="min-w-0 flex-1 truncate text-sm">{t(item.labelKey)}</span>
                    {field.value === item.value && <Check className="h-4 w-4 text-primary" />}
                  </Button>
                ))}
              </>
            )}
          />
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Languages className="h-4 w-4 text-primary" />
          {t('menu.language')}
        </div>
        <div className="mb-3 text-xs text-muted-foreground">
          {t('settings.languageDescription')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="locale"
            render={({ field }) => (
              <>
                {locales.map((item) => (
                  <Button
                    key={item.value}
                    variant={field.value === item.value ? 'secondary' : 'outline'}
                    className="h-9 justify-start rounded-md"
                    onClick={() => {
                      field.onChange(item.value)
                      setLocale(item.value)
                    }}
                  >
                    {t(item.labelKey)}
                  </Button>
                ))}
              </>
            )}
          />
        </div>
      </section>
    </div>
  )
}

export default AppearanceSettingsPage

const ThemePreview = ({ swatchClass }: { swatchClass: string }) => {
  return (
    <span className={`theme-swatch ${swatchClass} block h-9 w-12 shrink-0 overflow-hidden rounded`}>
      <span className="theme-swatch-preview relative block h-full w-full">
        <span className="absolute inset-y-0 left-0 w-4 bg-[var(--swatch-rail)]" />
        <span className="absolute left-5 top-2 h-1.5 w-5 rounded-full bg-[var(--swatch-accent)]" />
        <span className="absolute bottom-2 left-5 h-1 w-3 rounded-full bg-[var(--swatch-accent)] opacity-60" />
      </span>
    </span>
  )
}
