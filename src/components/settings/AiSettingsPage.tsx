import { SettingsPageStack } from '@/components/settings/SettingsRow'
import { LocalAiSettingsSection } from '@/components/settings/LocalAiSettingsSection'
import { AiProviderSettingsSections } from '@/components/settings/AiProviderSettingsSections'
import { AiCompletionSettingsSection } from '@/components/settings/AiCompletionSettingsSection'

const AiSettingsPage = () => (
  <SettingsPageStack>
    <AiCompletionSettingsSection />
    <LocalAiSettingsSection />
    <AiProviderSettingsSections />
  </SettingsPageStack>
)

export default AiSettingsPage
