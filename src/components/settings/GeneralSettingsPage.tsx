import { MonitorCog } from 'lucide-react'
import MarkdownDefaultAppPrompt from '@/components/MarkdownDefaultAppPrompt'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

const GeneralSettingsPage = () => {
  const { t } = useI18n()
  const showEditorStatusBar = usePreferencesStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = usePreferencesStore((state) => state.setShowEditorStatusBar)

  return (
    <SettingsPageStack>
      <SettingsSection title={t('settings.general')} icon={MonitorCog}>
        <SettingsSwitchRow
          title={t('settings.statusBar')}
          description={t('settings.statusBarDescription')}
          checked={showEditorStatusBar}
          onCheckedChange={setShowEditorStatusBar}
        />
      </SettingsSection>
      <MarkdownDefaultAppPrompt />
    </SettingsPageStack>
  )
}

export default GeneralSettingsPage
