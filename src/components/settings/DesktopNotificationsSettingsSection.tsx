import { Bell } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { SettingsSection, SettingsSwitchRow } from '@/components/settings/SettingsRow'

const DesktopNotificationsSettingsSection = () => {
  const { t } = useI18n()
  const enabled = usePreferencesStore((state) => state.desktopNotificationsEnabled)
  const backgroundOnly = usePreferencesStore((state) => state.desktopNotificationsBackgroundOnly)
  const exportsEnabled = usePreferencesStore((state) => state.desktopNotificationExportsEnabled)
  const syncEnabled = usePreferencesStore((state) => state.desktopNotificationSyncEnabled)
  const setEnabled = usePreferencesStore((state) => state.setDesktopNotificationsEnabled)
  const setBackgroundOnly = usePreferencesStore(
    (state) => state.setDesktopNotificationsBackgroundOnly,
  )
  const setExportsEnabled = usePreferencesStore(
    (state) => state.setDesktopNotificationExportsEnabled,
  )
  const setSyncEnabled = usePreferencesStore((state) => state.setDesktopNotificationSyncEnabled)

  return (
    <SettingsSection
      targetId="settings-desktop-notifications"
      title={t('settings.desktopNotificationsSection')}
      description={t('settings.desktopNotificationsSectionDescription')}
      icon={Bell}
    >
      <SettingsSwitchRow
        title={t('settings.desktopNotifications')}
        description={t('settings.desktopNotificationsDescription')}
        checked={enabled}
        onCheckedChange={setEnabled}
      />
      <SettingsSwitchRow
        title={t('settings.desktopNotificationsBackgroundOnly')}
        description={t('settings.desktopNotificationsBackgroundOnlyDescription')}
        checked={backgroundOnly}
        onCheckedChange={setBackgroundOnly}
        disabled={!enabled}
      />
      <SettingsSwitchRow
        title={t('settings.desktopNotificationExports')}
        description={t('settings.desktopNotificationExportsDescription')}
        checked={exportsEnabled}
        onCheckedChange={setExportsEnabled}
        disabled={!enabled}
      />
      <SettingsSwitchRow
        title={t('settings.desktopNotificationSync')}
        description={t('settings.desktopNotificationSyncDescription')}
        checked={syncEnabled}
        onCheckedChange={setSyncEnabled}
        disabled={!enabled}
      />
    </SettingsSection>
  )
}

export default DesktopNotificationsSettingsSection
