import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsFieldGroup,
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'
import ImmersiveSettingsSection from '@/components/settings/ImmersiveSettingsSection'

const EditingSettingsPage = () => {
  const { t } = useI18n()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const setMotionSmoothScrolling = usePreferencesStore((state) => state.setMotionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const setMotionAnimatedCursor = usePreferencesStore((state) => state.setMotionAnimatedCursor)
  const sourceCodeMiniMapEnabled = usePreferencesStore((state) => state.sourceCodeMiniMapEnabled)
  const setSourceCodeMiniMapEnabled = usePreferencesStore(
    (state) => state.setSourceCodeMiniMapEnabled,
  )
  const motionAnimatedPanels = usePreferencesStore((state) => state.motionAnimatedPanels)
  const setMotionAnimatedPanels = usePreferencesStore((state) => state.setMotionAnimatedPanels)

  return (
    <SettingsPageStack>
      <ImmersiveSettingsSection />

      <SettingsSection
        title={t('settings.sourceCode')}
        description={t('settings.sourceCodeDescription')}
      >
        <SettingsFieldGroup>
          <SettingsSwitchRow
            title={t('settings.sourceCodeMiniMap')}
            description={t('settings.sourceCodeMiniMapDescription')}
            checked={sourceCodeMiniMapEnabled}
            onCheckedChange={setSourceCodeMiniMapEnabled}
          />
        </SettingsFieldGroup>
      </SettingsSection>

      <SettingsSection title={t('settings.motion')} description={t('settings.motionDescription')}>
        <SettingsFieldGroup>
          <SettingsSwitchRow
            title={t('settings.motionSmoothScrolling')}
            description={t('settings.motionSmoothScrollingDescription')}
            checked={motionSmoothScrolling}
            onCheckedChange={setMotionSmoothScrolling}
          />
          <SettingsSwitchRow
            title={t('settings.motionAnimatedCursor')}
            description={t('settings.motionAnimatedCursorDescription')}
            checked={motionAnimatedCursor}
            onCheckedChange={setMotionAnimatedCursor}
          />
          <SettingsSwitchRow
            title={t('settings.motionAnimatedPanels')}
            description={t('settings.motionAnimatedPanelsDescription')}
            checked={motionAnimatedPanels}
            onCheckedChange={setMotionAnimatedPanels}
          />
        </SettingsFieldGroup>
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default EditingSettingsPage
