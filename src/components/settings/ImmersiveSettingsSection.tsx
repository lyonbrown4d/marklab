import { Switch } from '@/components/ui/switch'
import SettingsRow from '@/components/settings/SettingsRow'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const ImmersiveSettingsSection = () => {
  const { t } = useI18n()
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const setImmersiveZenMode = usePreferencesStore((state) => state.setImmersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const setImmersiveFocusMode = usePreferencesStore((state) => state.setImmersiveFocusMode)
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const setImmersiveTypewriterMode = usePreferencesStore(
    (state) => state.setImmersiveTypewriterMode,
  )

  return (
    <section className="settings-row-surface space-y-3 rounded-md p-3">
      <div>
        <div className="mb-1 text-sm font-medium">{t('settings.immersiveEditing')}</div>
        <div className="text-xs leading-5 text-muted-foreground">
          {t('settings.immersiveEditingDescription')}
        </div>
      </div>
      <SettingsRow
        title={t('settings.zenMode')}
        description={t('settings.zenModeDescription')}
        control={<Switch checked={immersiveZenMode} onCheckedChange={setImmersiveZenMode} />}
      />
      <SettingsRow
        title={t('settings.focusMode')}
        description={t('settings.focusModeDescription')}
        control={<Switch checked={immersiveFocusMode} onCheckedChange={setImmersiveFocusMode} />}
      />
      <SettingsRow
        title={t('settings.typewriterMode')}
        description={t('settings.typewriterModeDescription')}
        control={
          <Switch checked={immersiveTypewriterMode} onCheckedChange={setImmersiveTypewriterMode} />
        }
      />
    </section>
  )
}

export default ImmersiveSettingsSection
