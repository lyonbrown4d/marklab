import { SettingsPageStack } from '@/components/settings/SettingsRow'
import { AiProviderSettingsSections } from '@/components/settings/AiProviderSettingsSections'
import { AiCompletionSettingsSection } from '@/components/settings/AiCompletionSettingsSection'

const AiSettingsPage = () => (
  <SettingsPageStack>
    <AiCompletionSettingsSection />
    <AiProviderSettingsSections />
  </SettingsPageStack>
)

export default AiSettingsPage
