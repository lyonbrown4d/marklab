import { Map } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { GraphContentMode, GraphMiniMapPosition, GraphMiniMapSize } from '@/store/appTypes'
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

const miniMapPositions: Array<{ value: GraphMiniMapPosition; labelKey: string }> = [
  { value: 'top-left', labelKey: 'settings.graphMiniMapTopLeft' },
  { value: 'top-right', labelKey: 'settings.graphMiniMapTopRight' },
  { value: 'bottom-left', labelKey: 'settings.graphMiniMapBottomLeft' },
  { value: 'bottom-right', labelKey: 'settings.graphMiniMapBottomRight' },
]

const miniMapSizes: Array<{ value: GraphMiniMapSize; labelKey: string }> = [
  { value: 'compact', labelKey: 'settings.graphMiniMapCompact' },
  { value: 'regular', labelKey: 'settings.graphMiniMapRegular' },
]

const GraphSettingsPage = () => {
  const { t } = useI18n()
  const graphMiniMapEnabled = usePreferencesStore((state) => state.graphMiniMapEnabled)
  const setGraphMiniMapEnabled = usePreferencesStore((state) => state.setGraphMiniMapEnabled)
  const graphMiniMapPosition = usePreferencesStore((state) => state.graphMiniMapPosition)
  const setGraphMiniMapPosition = usePreferencesStore((state) => state.setGraphMiniMapPosition)
  const graphMiniMapSize = usePreferencesStore((state) => state.graphMiniMapSize)
  const setGraphMiniMapSize = usePreferencesStore((state) => state.setGraphMiniMapSize)
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
        <SettingsChoiceGrid columns={2} aria-label={t('settings.graphMiniMapPosition')}>
          {miniMapPositions.map((item) => (
            <SettingsChoiceButton
              key={item.value}
              selected={graphMiniMapPosition === item.value}
              className="justify-center"
              onClick={() => setGraphMiniMapPosition(item.value)}
            >
              {t(item.labelKey)}
            </SettingsChoiceButton>
          ))}
        </SettingsChoiceGrid>
        <SettingsChoiceGrid columns={2} aria-label={t('settings.graphMiniMapSize')}>
          {miniMapSizes.map((item) => (
            <SettingsChoiceButton
              key={item.value}
              selected={graphMiniMapSize === item.value}
              className="justify-center"
              onClick={() => setGraphMiniMapSize(item.value)}
            >
              {t(item.labelKey)}
            </SettingsChoiceButton>
          ))}
        </SettingsChoiceGrid>
      </SettingsSection>
      <SettingsSection
        title={t('settings.graphContentMode')}
        description={t('settings.graphContentModeDescription')}
        icon={Map}
      >
        <SettingsChoiceGrid columns={3} aria-label={t('settings.graphContentMode')}>
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
