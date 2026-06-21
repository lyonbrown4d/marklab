import { CloudCog } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsFieldGroup,
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

const SavingSettingsPage = () => {
  const { t } = useI18n()
  const silentSave = usePreferencesStore((state) => state.silentSave)
  const setSilentSave = usePreferencesStore((state) => state.setSilentSave)

  return (
    <SettingsPageStack>
      <SettingsSection
        title={t('settings.saveBehavior')}
        description={t('settings.detailedSaveDescription')}
        icon={CloudCog}
      >
        <SettingsFieldGroup>
          <SettingsSwitchRow
            title={t('settings.silentSave')}
            description={t('settings.silentSaveDescription')}
            checked={silentSave}
            onCheckedChange={setSilentSave}
          />
          <SettingsSwitchRow
            title={t('settings.detailedSave')}
            description={t('settings.detailedSaveDescription')}
            checked={!silentSave}
            onCheckedChange={(checked) => setSilentSave(!checked)}
          />
        </SettingsFieldGroup>
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default SavingSettingsPage
