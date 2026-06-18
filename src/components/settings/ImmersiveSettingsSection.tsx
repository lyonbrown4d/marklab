import { Eye } from 'lucide-react'
import SettingsRow, { SettingsSection } from '@/components/settings/SettingsRow'
import SettingsSwitch from '@/components/settings/SettingsSwitch'
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
    <SettingsSection
      title={t('settings.immersiveEditing')}
      description={t('settings.immersiveEditingDescription')}
      icon={Eye}
      className="space-y-3"
    >
      <SettingsRow
        title={t('settings.zenMode')}
        description={t('settings.zenModeDescription')}
        control={
          <SettingsSwitch checked={immersiveZenMode} onCheckedChange={setImmersiveZenMode} />
        }
      />
      <SettingsRow
        title={t('settings.focusMode')}
        description={t('settings.focusModeDescription')}
        control={
          <SettingsSwitch checked={immersiveFocusMode} onCheckedChange={setImmersiveFocusMode} />
        }
      />
      <SettingsRow
        title={t('settings.typewriterMode')}
        description={t('settings.typewriterModeDescription')}
        control={
          <SettingsSwitch
            checked={immersiveTypewriterMode}
            onCheckedChange={setImmersiveTypewriterMode}
          />
        }
      />
    </SettingsSection>
  )
}

export default ImmersiveSettingsSection
