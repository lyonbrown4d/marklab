import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Map } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { GraphContentMode } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

const graphContentModes: Array<{ value: GraphContentMode; labelKey: string }> = [
  { value: 'none', labelKey: 'settings.graphContentNone' },
  { value: 'summary', labelKey: 'settings.graphContentSummary' },
  { value: 'full', labelKey: 'settings.graphContentFull' },
]

const graphSettingsSchema = z.object({
  graphMiniMapEnabled: z.boolean(),
  graphContentMode: z.enum(['none', 'summary', 'full']),
})

type GraphSettingsValues = z.infer<typeof graphSettingsSchema>

const GraphSettingsPage = () => {
  const { t } = useI18n()
  const graphMiniMapEnabled = usePreferencesStore((state) => state.graphMiniMapEnabled)
  const setGraphMiniMapEnabled = usePreferencesStore((state) => state.setGraphMiniMapEnabled)
  const graphContentMode = usePreferencesStore((state) => state.graphContentMode)
  const setGraphContentMode = usePreferencesStore((state) => state.setGraphContentMode)
  const form = useForm<GraphSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(graphSettingsSchema),
    values: {
      graphMiniMapEnabled,
      graphContentMode,
    },
  })

  return (
    <div className="space-y-4">
      <SettingsSection
        title={t('settings.graphMiniMap')}
        description={t('settings.graphMiniMapDescription')}
        icon={Map}
      >
        <Controller
          control={form.control}
          name="graphMiniMapEnabled"
          render={({ field }) => (
            <SettingsSwitchRow
              title={t('settings.graphMiniMap')}
              description={t('settings.graphMiniMapDescription')}
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked)
                setGraphMiniMapEnabled(checked)
              }}
            />
          )}
        />
      </SettingsSection>
      <SettingsSection
        title={t('settings.graphContentMode')}
        description={t('settings.graphContentModeDescription')}
        icon={Map}
      >
        <SettingsChoiceGrid columns={3}>
          <Controller
            control={form.control}
            name="graphContentMode"
            render={({ field }) => (
              <>
                {graphContentModes.map((item) => (
                  <SettingsChoiceButton
                    key={item.value}
                    selected={field.value === item.value}
                    className="justify-center"
                    onClick={() => {
                      field.onChange(item.value)
                      setGraphContentMode(item.value)
                    }}
                  >
                    {t(item.labelKey)}
                  </SettingsChoiceButton>
                ))}
              </>
            )}
          />
        </SettingsChoiceGrid>
      </SettingsSection>
    </div>
  )
}

export default GraphSettingsPage
