import { Check, Languages, Palette } from 'lucide-react'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsFieldGroup,
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchField,
  SettingsSubsection,
} from '@/components/settings/SettingsRow'
import CustomThemesSettingsSection from '@/components/settings/CustomThemesSettingsSection'
import { useI18n } from '@/i18n/useI18n'
import type { Locale } from '@/i18n/resources'
import { darkThemes, lightThemes } from '@/logic/themes'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const locales: Array<{ value: Locale; labelKey: string }> = [
  { value: 'zh-CN', labelKey: 'language.zh' },
  { value: 'en-US', labelKey: 'language.en' },
]

const AppearanceSettingsPage = () => {
  const { t, locale, setLocale } = useI18n()
  const themeMode = usePreferencesStore((state) => state.themeMode)
  const autoSystemThemeSync = usePreferencesStore((state) => state.autoSystemThemeSync)
  const lightTheme = usePreferencesStore((state) => state.lightTheme)
  const darkTheme = usePreferencesStore((state) => state.darkTheme)
  const setThemeMode = usePreferencesStore((state) => state.setThemeMode)
  const setAutoSystemThemeSync = usePreferencesStore((state) => state.setAutoSystemThemeSync)
  const setLightTheme = usePreferencesStore((state) => state.setLightTheme)
  const setDarkTheme = usePreferencesStore((state) => state.setDarkTheme)

  return (
    <SettingsPageStack className="gap-5">
      <SettingsSection
        title={t('menu.theme')}
        description={t('settings.themeDescription')}
        icon={Palette}
        surface={false}
      >
        <SettingsFieldGroup className="gap-4">
          <SettingsChoiceGrid columns={2}>
            {(['system', 'light', 'dark'] as const).map((mode) => (
              <SettingsChoiceButton
                key={mode}
                selected={themeMode === mode}
                onClick={() => setThemeMode(mode)}
              >
                {t(`themeMode.${mode}`)}
              </SettingsChoiceButton>
            ))}
          </SettingsChoiceGrid>

          <SettingsSwitchField
            title={t('settings.autoSystemThemeSync')}
            description={t('settings.autoSystemThemeSyncDescription')}
            checked={autoSystemThemeSync}
            onCheckedChange={setAutoSystemThemeSync}
          />

          <SettingsSubsection title={t('settings.lightTheme')}>
            <SettingsChoiceGrid columns={2}>
              {lightThemes.map((item) => (
                <SettingsChoiceButton
                  key={item.value}
                  selected={lightTheme === item.value}
                  selectedVariant="ghost"
                  unselectedVariant="ghost"
                  className="theme-choice h-auto gap-3 p-2 text-left shadow-none"
                  onClick={() => setLightTheme(item.value)}
                >
                  <ThemePreview swatchClass={item.swatchClass} />
                  <span className="min-w-0 flex-1 truncate text-sm">{t(item.labelKey)}</span>
                  {lightTheme === item.value && <Check data-icon="inline-end" />}
                </SettingsChoiceButton>
              ))}
            </SettingsChoiceGrid>
          </SettingsSubsection>

          <SettingsSubsection title={t('settings.darkTheme')}>
            <SettingsChoiceGrid columns={2}>
              {darkThemes.map((item) => (
                <SettingsChoiceButton
                  key={item.value}
                  selected={darkTheme === item.value}
                  selectedVariant="ghost"
                  unselectedVariant="ghost"
                  className="theme-choice h-auto gap-3 p-2 text-left shadow-none"
                  onClick={() => setDarkTheme(item.value)}
                >
                  <ThemePreview swatchClass={item.swatchClass} />
                  <span className="min-w-0 flex-1 truncate text-sm">{t(item.labelKey)}</span>
                  {darkTheme === item.value && <Check data-icon="inline-end" />}
                </SettingsChoiceButton>
              ))}
            </SettingsChoiceGrid>
          </SettingsSubsection>
        </SettingsFieldGroup>
      </SettingsSection>

      <CustomThemesSettingsSection />

      <SettingsSection
        title={t('menu.language')}
        description={t('settings.languageDescription')}
        icon={Languages}
        surface={false}
      >
        <SettingsChoiceGrid columns={2}>
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
