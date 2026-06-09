import { useEffect, useState } from 'react'
import { Check, FolderOpen, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SettingsSection } from '@/components/settings/SettingsRow'
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
    </SettingsSection>
  )
}

export default CustomThemesSettingsSection
