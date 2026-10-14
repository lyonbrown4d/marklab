import { Languages, Monitor, Moon, Palette, Sun } from 'lucide-react'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsFieldGroup,
  SettingsPageStack,
  SettingsSection,
  SettingsSubsection,
} from '@/components/settings/SettingsRow'
import CustomThemesSettingsSection from '@/components/settings/CustomThemesSettingsSection'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { darkThemes, isDarkThemeMode, lightThemes } from '@/logic/themes'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const locales: Array<{ value: Locale; labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'language.zh' },
  { value: 'en-US', labelKey: 'language.en' },
]

const AppearanceSettingsPage = () => {
  const { t, locale, setLocale } = useI18n()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const theme = usePreferencesStore((state) => state.theme)
  const lightTheme = usePreferencesStore((state) => state.lightTheme)
  const darkTheme = usePreferencesStore((state) => state.darkTheme)
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode)
  const setLightTheme = usePreferencesStore((state) => state.setLightTheme)
  const setDarkTheme = usePreferencesStore((state) => state.setDarkTheme)

  return (
    <SettingsPageStack className="gap-5">
      <SettingsSection
        targetId="settings-theme"
        title={t('menu.theme')}
        icon={Palette}
        surface={false}
      >
        <SettingsFieldGroup className="gap-4">
          <SettingsChoiceGrid columns={3} aria-label={t('menu.theme')}>
            {(
              [
                ['system', Monitor],
                ['light', Sun],
                ['dark', Moon],
              ] as const
            ).map(([mode, Icon]) => (
              <SettingsChoiceButton
                key={mode}
                selected={themeMode === mode}
                className="gap-2"
                onClick={() => setThemeMode(mode)}
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(`themeMode.${mode}`)}
              </SettingsChoiceButton>
            ))}
          </SettingsChoiceGrid>
          {themeMode === 'system' && (
            <p aria-live="polite" role="status" className="text-xs text-muted-foreground">
              {t('settings.systemThemeCurrent', {
                mode: t(isDarkThemeMode(theme) ? 'themeMode.dark' : 'themeMode.light'),
              })}
            </p>
          )}

          <SettingsSubsection title={t('settings.lightTheme')}>
            <SettingsChoiceGrid columns={2} aria-label={t('settings.lightTheme')}>
              {lightThemes.map((item) => (
                <SettingsChoiceButton
                  key={item.value}
                  selected={lightTheme === item.value}
                  className="gap-2"
                  onClick={() => setLightTheme(item.value)}
                >
                  <ThemeSwatch swatchClass={item.swatchClass} />
                  <span className="truncate">{t(item.labelKey)}</span>
                </SettingsChoiceButton>
              ))}
            </SettingsChoiceGrid>
          </SettingsSubsection>

          <SettingsSubsection title={t('settings.darkTheme')}>
            <SettingsChoiceGrid columns={2} aria-label={t('settings.darkTheme')}>
              {darkThemes.map((item) => (
                <SettingsChoiceButton
                  key={item.value}
                  selected={darkTheme === item.value}
                  className="gap-2"
                  onClick={() => setDarkTheme(item.value)}
                >
                  <ThemeSwatch swatchClass={item.swatchClass} />
                  <span className="truncate">{t(item.labelKey)}</span>
                </SettingsChoiceButton>
              ))}
            </SettingsChoiceGrid>
          </SettingsSubsection>
        </SettingsFieldGroup>
      </SettingsSection>

      <CustomThemesSettingsSection />

      <SettingsSection
        targetId="settings-language"
        title={t('menu.language')}
        icon={Languages}
        surface={false}
      >
        <SettingsChoiceGrid columns={2} aria-label={t('menu.language')}>
          {locales.map((item) => (
            <SettingsChoiceButton
              key={item.value}
              selected={locale === item.value}
              selectedVariant="ghost"
              unselectedVariant="ghost"
              onClick={() => setLocale(item.value)}
            >
              {t(item.labelKey)}
            </SettingsChoiceButton>
          ))}
        </SettingsChoiceGrid>
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default AppearanceSettingsPage

const ThemeSwatch = ({ swatchClass }: { swatchClass: string }) => {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-4 shrink-0 overflow-hidden rounded-sm border border-foreground/20',
        swatchClass,
      )}
    >
      <span className="w-1/2 bg-[var(--swatch-bg)]" />
      <span className="w-1/2 bg-[var(--swatch-accent)]" />
    </span>
  )
}
