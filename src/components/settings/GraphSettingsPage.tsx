import { Map } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { GraphContentMode } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

const graphContentModes: Array<{ value: GraphContentMode; labelKey: string }> = [
  { value: 'none', labelKey: 'settings.graphContentNone' },
  { value: 'summary', labelKey: 'settings.graphContentSummary' },
  { value: 'full', labelKey: 'settings.graphContentFull' },
]

const GraphSettingsPage = () => {
  const { t } = useI18n()
  const graphMiniMapEnabled = usePreferencesStore((state) => state.graphMiniMapEnabled)
  const setGraphMiniMapEnabled = usePreferencesStore((state) => state.setGraphMiniMapEnabled)
  const graphContentMode = usePreferencesStore((state) => state.graphContentMode)
  const setGraphContentMode = usePreferencesStore((state) => state.setGraphContentMode)

  return (
    <SettingsPageStack>
      <SettingsSection
        title={t('settings.graphMiniMap')}
        description={t('settings.graphMiniMapDescription')}
        icon={Map}
      >
        <SettingsSwitchRow
          title={t('settings.graphMiniMap')}
          description={t('settings.graphMiniMapDescription')}
          checked={graphMiniMapEnabled}
          onCheckedChange={setGraphMiniMapEnabled}
        />
      </SettingsSection>
      <SettingsSection
        title={t('settings.graphContentMode')}
        description={t('settings.graphContentModeDescription')}
        icon={Map}
      >
        <SettingsChoiceGrid columns={3}>
          {graphContentModes.map((item) => (
            <SettingsChoiceButton
              key={item.value}
              selected={graphContentMode === item.value}
              className="justify-center"
              onClick={() => setGraphContentMode(item.value)}
            >
              {t(item.labelKey)}
            </SettingsChoiceButton>
          ))}
        </SettingsChoiceGrid>
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default GraphSettingsPage
