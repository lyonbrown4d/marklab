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
        <div className="mt-2 flex flex-col gap-2">
          {customThemes.map((item) => {
            const removeLabel = t('settings.removeCustomTheme', { name: item.name })
            const selected = customThemeId === item.id
            return (
              <div
                key={item.id}
                data-selected={selected ? 'true' : 'false'}
                className="settings-theme-item flex items-center gap-2 rounded-md border border-[color-mix(in_srgb,hsl(var(--border))_78%,transparent)] bg-background px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-[var(--motion-duration-fast)] ease-[ease] hover:-translate-y-px hover:border-[color-mix(in_srgb,hsl(var(--border))_56%,hsl(var(--foreground))_44%)] hover:shadow-[0_1px_2px_color-mix(in_srgb,hsl(var(--foreground))_12%,transparent)] active:translate-y-0 data-[selected=true]:border-[color-mix(in_srgb,hsl(var(--primary))_54%,hsl(var(--border))_46%)] data-[selected=true]:bg-[color-mix(in_srgb,hsl(var(--primary))_8%,hsl(var(--card))_92%)] data-[selected=true]:hover:border-[color-mix(in_srgb,hsl(var(--primary))_64%,hsl(var(--border))_36%)] motion-reduce:transition-none motion-reduce:hover:translate-none motion-reduce:active:translate-none"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer rounded-sm px-1 py-0.5 text-left text-sm text-inherit hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:![box-shadow:0_0_0_2px_color-mix(in_srgb,hsl(var(--ring))_26%,transparent)]"
                  aria-label={item.name}
                  aria-pressed={selected}
                  onClick={() => setCustomThemeId(item.id)}
                >
                  <span className="block truncate font-medium">{item.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.id}</span>
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
