import { MonitorCog } from 'lucide-react'
import MarkdownDefaultAppPrompt from '@/components/MarkdownDefaultAppPrompt'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'
import TerminalSettingsSection from '@/components/settings/TerminalSettingsSection'
import DesktopNotificationsSettingsSection from '@/components/settings/DesktopNotificationsSettingsSection'
import SoftwareUpdateSettingsSection from '@/components/settings/SoftwareUpdateSettingsSection'

const GeneralSettingsPage = () => {
  const { t } = useI18n()
  const showEditorStatusBar = usePreferencesStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = usePreferencesStore((state) => state.setShowEditorStatusBar)

  return (
    <SettingsPageStack>
      <SettingsSection
        targetId="settings-status-bar"
        title={t('settings.general')}
        icon={MonitorCog}
      >
        <SettingsSwitchRow
          title={t('settings.statusBar')}
          description={t('settings.statusBarDescription')}
          checked={showEditorStatusBar}
          onCheckedChange={setShowEditorStatusBar}
        />
      </SettingsSection>
      <DesktopNotificationsSettingsSection />
      <SoftwareUpdateSettingsSection />
      <TerminalSettingsSection />
      <MarkdownDefaultAppPrompt />
    </SettingsPageStack>
  )
}

export default GeneralSettingsPage
