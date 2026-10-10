import { Eye } from 'lucide-react'
import {
  SettingsFieldGroup,
  SettingsSelectField,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'
import { useI18n } from '@/i18n/useI18n'
import type { ImmersiveFocusIntensity, ImmersiveFocusScope } from '@/store/immersivePreferences'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const ImmersiveSettingsSection = () => {
  const { t } = useI18n()
  const immersiveZenMode = usePreferencesStore((state) => state.immersiveZenMode)
  const setImmersiveZenMode = usePreferencesStore((state) => state.setImmersiveZenMode)
  const immersiveFocusMode = usePreferencesStore((state) => state.immersiveFocusMode)
  const setImmersiveFocusMode = usePreferencesStore((state) => state.setImmersiveFocusMode)
  const immersiveFocusScope = usePreferencesStore((state) => state.immersiveFocusScope)
  const setImmersiveFocusScope = usePreferencesStore((state) => state.setImmersiveFocusScope)
  const immersiveFocusIntensity = usePreferencesStore((state) => state.immersiveFocusIntensity)
  const setImmersiveFocusIntensity = usePreferencesStore(
    (state) => state.setImmersiveFocusIntensity,
  )
  const immersiveTypewriterMode = usePreferencesStore((state) => state.immersiveTypewriterMode)
  const setImmersiveTypewriterMode = usePreferencesStore(
    (state) => state.setImmersiveTypewriterMode,
  )

  return (
    <SettingsSection
      targetId="settings-immersive-editing"
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
        <SettingsSelectField
          title={t('settings.focusScope')}
          description={t('settings.focusScopeDescription')}
          value={immersiveFocusScope}
          onValueChange={(value) => setImmersiveFocusScope(value as ImmersiveFocusScope)}
          disabled={!immersiveFocusMode}
          options={[
            { value: 'block', label: t('settings.focusScopeBlock') },
            { value: 'section', label: t('settings.focusScopeSection') },
          ]}
        />
        <SettingsSelectField
          title={t('settings.focusIntensity')}
          description={t('settings.focusIntensityDescription')}
          value={immersiveFocusIntensity}
          onValueChange={(value) => setImmersiveFocusIntensity(value as ImmersiveFocusIntensity)}
          disabled={!immersiveFocusMode}
          options={[
            { value: 'soft', label: t('settings.focusIntensitySoft') },
            { value: 'standard', label: t('settings.focusIntensityStandard') },
            { value: 'strong', label: t('settings.focusIntensityStrong') },
          ]}
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
