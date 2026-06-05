import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Check, FolderOpen, Languages, Palette, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { useAppStore, type ThemeMode } from '@/store/useAppStore'
import { userThemeApi, type UserThemeInfo } from '@/services/userThemeApi'
import { toast } from 'sonner'

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
  const customThemeId = useAppStore((state) => state.customThemeId)
  const setCustomThemeId = useAppStore((state) => state.setCustomThemeId)
  const [customThemes, setCustomThemes] = useState<UserThemeInfo[]>([])
  const [themeBusy, setThemeBusy] = useState(false)
  const customThemesSupported = userThemeApi.isSupported()
  const form = useForm<AppearanceSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(appearanceSettingsSchema),
    values: {
      theme,
      locale,
    },
  })

  useEffect(() => {
    if (!customThemesSupported) return
    let cancelled = false
    void userThemeApi
      .list()
      .then((themes) => {
        if (!cancelled) setCustomThemes(themes)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error('Failed to load custom themes', {
            description: String(error),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [customThemesSupported])

  const refreshCustomThemes = async () => {
    if (!customThemesSupported) return
    setCustomThemes(await userThemeApi.list())
  }

  const importCustomTheme = async () => {
    if (!customThemesSupported || themeBusy) return
    setThemeBusy(true)
    try {
      const path = await userThemeApi.pickCssFile()
      if (!path) return
      const nextTheme = await userThemeApi.importCss(path)
      setCustomThemeId(nextTheme.id)
      await refreshCustomThemes()
      toast.success('Custom theme imported', {
        description: nextTheme.name,
      })
    } catch (error) {
      toast.error('Failed to import custom theme', {
        description: String(error),
      })
    } finally {
      setThemeBusy(false)
    }
  }

  const removeCustomTheme = async (themeId: string) => {
    if (!customThemesSupported || themeBusy) return
    setThemeBusy(true)
    try {
      await userThemeApi.remove(themeId)
      if (customThemeId === themeId) setCustomThemeId(null)
      await refreshCustomThemes()
      toast.success('Custom theme removed')
    } catch (error) {
      toast.error('Failed to remove custom theme', {
        description: String(error),
      })
    } finally {
      setThemeBusy(false)
    }
  }

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

      <section className="settings-row-surface rounded-md p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Upload className="h-4 w-4 text-primary" />
          {t('settings.customThemes')}
        </div>
        <div className="mb-3 text-xs leading-5 text-muted-foreground">
          {t('settings.customThemesDescription')}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!customThemesSupported || themeBusy}
            onClick={() => void importCustomTheme()}
          >
            <Upload className="h-4 w-4" />
            {t('settings.importTheme')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!customThemesSupported || themeBusy}
            onClick={() => void userThemeApi.openFolder()}
          >
            <FolderOpen className="h-4 w-4" />
            {t('settings.openThemesFolder')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={customThemeId ? 'outline' : 'secondary'}
            onClick={() => setCustomThemeId(null)}
          >
            {t('settings.useBuiltInTheme')}
          </Button>
        </div>
        {customThemesSupported && customThemes.length > 0 ? (
          <div className="space-y-2">
            {customThemes.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-sm"
                  onClick={() => setCustomThemeId(item.id)}
                >
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.id}</span>
                </button>
                {customThemeId === item.id && <Check className="h-4 w-4 text-primary" />}
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={themeBusy}
                  onClick={() => void removeCustomTheme(item.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            {customThemesSupported
              ? t('settings.noCustomThemes')
              : t('settings.customThemesDesktopOnly')}
          </div>
        )}
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
