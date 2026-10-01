import { SettingsPageStack } from '@/components/settings/SettingsRow'
import { LocalAiSettingsSection } from '@/components/settings/LocalAiSettingsSection'
import { AiProviderSettingsSections } from '@/components/settings/AiProviderSettingsSections'

const AiSettingsPage = () => (
  <SettingsPageStack>
    <LocalAiSettingsSection />
    <AiProviderSettingsSections />
  </SettingsPageStack>
)

export default AiSettingsPage
