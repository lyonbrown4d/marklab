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
          toast.error(t('settings.customThemesLoadFailed'), {
            description: String(error),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [customThemesSupported, t])

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
      toast.success(t('settings.customThemeImported'), {
        description: nextTheme.name,
      })
    } catch (error) {
      toast.error(t('settings.customThemeImportFailed'), {
        description: String(error),
      })
    } finally {
      setThemeBusy(false)
    }
  }

  const openCustomThemesFolder = async () => {
    if (!customThemesSupported || themeBusy) return
    setThemeBusy(true)
    try {
      await userThemeApi.openFolder()
    } catch (error) {
      toast.error(t('settings.openThemesFolderFailed'), {
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
      toast.success(t('settings.customThemeRemoved'))
    } catch (error) {
      toast.error(t('settings.customThemeRemoveFailed'), {
        description: String(error),
      })
    } finally {
      setThemeBusy(false)
    }
  }

  return (
    <SettingsSection
      targetId="settings-custom-themes"
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
          onClick={() => void openCustomThemesFolder()}
        >
          <FolderOpen data-icon="inline-start" />
          {t('settings.openThemesFolder')}
        </SettingsActionButton>
        <SettingsActionButton
          type="button"
          size="sm"
          variant={customThemeId ? 'outline' : 'secondary'}
          aria-pressed={!customThemeId}
          onClick={() => setCustomThemeId(null)}
        >
          {t('settings.useBuiltInTheme')}
        </SettingsActionButton>
      </div>
      {customThemesSupported && customThemes.length > 0 ? (
        <div className="mt-2 flex flex-col divide-y divide-border/50">
          {customThemes.map((item) => {
            const removeLabel = t('settings.removeCustomTheme', { name: item.name })
            const selected = customThemeId === item.id
            return (
              <div
                key={item.id}
                data-selected={selected ? 'true' : 'false'}
                className="settings-theme-item flex items-center gap-2 px-1 py-2 transition-colors hover:bg-accent/30 data-[selected=true]:bg-accent/50 motion-reduce:transition-none"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer rounded-sm px-1 py-0.5 text-left text-sm text-inherit hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:![box-shadow:0_0_0_2px_color-mix(in_srgb,hsl(var(--ring))_26%,transparent)]"
                  aria-label={item.name}
                  aria-pressed={selected}
                  onClick={() => setCustomThemeId(item.id)}
                >
                  <span className="block truncate font-medium">{item.name}</span>
                </button>
                {selected && (
                  <Check
                    className="settings-theme-check size-4 shrink-0 animate-[settings-theme-check-in_var(--motion-duration-fast)_var(--motion-ease-standard)_both] text-primary motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                )}
                <SettingsIconButton
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  disabled={themeBusy}
                  aria-label={removeLabel}
                  title={removeLabel}
                  onClick={() => void removeCustomTheme(item.id)}
                >
                  <Trash2 />
                </SettingsIconButton>
              </div>
            )
          })}
        </div>
      ) : (
        <SettingsEmptyState>
          {customThemesSupported
            ? t('settings.noCustomThemes')
            : t('settings.customThemesDesktopOnly')}
        </SettingsEmptyState>
      )}
    </SettingsSection>
  )
}

export default CustomThemesSettingsSection
