import { Eye } from 'lucide-react'
import {
  SettingsFieldGroup,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'
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
    >
      <SettingsFieldGroup>
        <SettingsSwitchRow
          title={t('settings.zenMode')}
          description={t('settings.zenModeDescription')}
          checked={immersiveZenMode}
          onCheckedChange={setImmersiveZenMode}
        />
        <SettingsSwitchRow
          title={t('settings.focusMode')}
          description={t('settings.focusModeDescription')}
          checked={immersiveFocusMode}
          onCheckedChange={setImmersiveFocusMode}
        />
        <SettingsSwitchRow
          title={t('settings.typewriterMode')}
          description={t('settings.typewriterModeDescription')}
          checked={immersiveTypewriterMode}
          onCheckedChange={setImmersiveTypewriterMode}
        />
      </SettingsFieldGroup>
    </SettingsSection>
  )
}

export default ImmersiveSettingsSection
