import { useEffect, useState } from 'react'
import { Check, FolderOpen, Trash2, Upload } from 'lucide-react'
import {
  SettingsActionButton,
  SettingsEmptyState,
  SettingsIconButton,
  SettingsSection,
} from '@/components/settings/SettingsRow'
import { useI18n } from '@/i18n/useI18n'
import { userThemeApi, type UserThemeInfo } from '@/services/userThemeApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { toast } from 'sonner'

const CustomThemesSettingsSection = () => {
  const { t } = useI18n()
  const customThemeId = usePreferencesStore((state) => state.customThemeId)
  const setCustomThemeId = usePreferencesStore((state) => state.setCustomThemeId)
  const [customThemes, setCustomThemes] = useState<UserThemeInfo[]>([])
  const [themeBusy, setThemeBusy] = useState(false)
  const customThemesSupported = userThemeApi.isSupported()

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
    <SettingsSection
      title={t('settings.customThemes')}
      description={t('settings.customThemesDescription')}
      icon={Upload}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <SettingsActionButton
          type="button"
          size="sm"
          variant="secondary"
          disabled={!customThemesSupported || themeBusy}
          onClick={() => void importCustomTheme()}
        >
          <Upload data-icon="inline-start" />
          {t('settings.importTheme')}
        </SettingsActionButton>
        <SettingsActionButton
          type="button"
          size="sm"
          variant="outline"
          disabled={!customThemesSupported || themeBusy}
          onClick={() => void userThemeApi.openFolder()}
        >
          <FolderOpen data-icon="inline-start" />
          {t('settings.openThemesFolder')}
        </SettingsActionButton>
        <SettingsActionButton
          type="button"
          size="sm"
          variant={customThemeId ? 'outline' : 'secondary'}
          onClick={() => setCustomThemeId(null)}
        >
          {t('settings.useBuiltInTheme')}
        </SettingsActionButton>
      </div>
      {customThemesSupported && customThemes.length > 0 ? (
        <div className="settings-theme-list flex flex-col gap-2">
          {customThemes.map((item) => (
            <div
              key={item.id}
              className="settings-theme-item flex items-center gap-2 rounded-md px-3 py-2.5"
            >
              <button
                type="button"
                className="settings-theme-item-trigger min-w-0 flex-1 rounded-sm px-1 py-0.5 text-left text-sm"
                onClick={() => setCustomThemeId(item.id)}
              >
                <span className="block truncate font-medium">{item.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.id}</span>
              </button>
              {customThemeId === item.id && <Check className="settings-theme-check" />}
              <SettingsIconButton
                type="button"
                size="icon"
                variant="ghost"
                className="size-8"
                disabled={themeBusy}
                onClick={() => void removeCustomTheme(item.id)}
              >
                <Trash2 />
              </SettingsIconButton>
            </div>
          ))}
        </div>
      ) : (
        <SettingsEmptyState className="px-3 py-4 text-left">
          {customThemesSupported
            ? t('settings.noCustomThemes')
            : t('settings.customThemesDesktopOnly')}
        </SettingsEmptyState>
      )}
    </SettingsSection>
  )
}

export default CustomThemesSettingsSection
