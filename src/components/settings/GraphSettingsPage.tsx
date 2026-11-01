import { Network } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

const GraphSettingsPage = () => {
  const { t } = useI18n()
  const attachments = usePreferencesStore((state) => state.graphShowAttachments)
  const missing = usePreferencesStore((state) => state.graphShowMissing)
  const setAttachments = usePreferencesStore((state) => state.setGraphShowAttachments)
  const setMissing = usePreferencesStore((state) => state.setGraphShowMissing)

  return (
    <SettingsPageStack>
      <SettingsSection
        targetId="settings-graph-relations"
        title={t('knowledgeGraph.settings')}
        description={t('knowledgeGraph.settingsDescription')}
        icon={Network}
      >
        <SettingsSwitchRow
          title={t('knowledgeGraph.showAttachments')}
          description={t('knowledgeGraph.attachmentsDescription')}
          checked={attachments}
          onCheckedChange={setAttachments}
        />
        <SettingsSwitchRow
          title={t('knowledgeGraph.showMissing')}
          description={t('knowledgeGraph.missingDescription')}
          checked={missing}
          onCheckedChange={setMissing}
        />
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default GraphSettingsPage
