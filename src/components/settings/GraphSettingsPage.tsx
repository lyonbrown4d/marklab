import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Map } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import { useAppStore, type GraphContentMode } from '@/store/useAppStore'
import SettingsRow from '@/components/settings/SettingsRow'

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
  const graphMiniMapEnabled = useAppStore((state) => state.graphMiniMapEnabled)
  const setGraphMiniMapEnabled = useAppStore((state) => state.setGraphMiniMapEnabled)
  const graphContentMode = useAppStore((state) => state.graphContentMode)
  const setGraphContentMode = useAppStore((state) => state.setGraphContentMode)
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
      <SettingsRow
        title={t('settings.graphMiniMap')}
        description={t('settings.graphMiniMapDescription')}
        control={
          <Controller
            control={form.control}
            name="graphMiniMapEnabled"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setGraphMiniMapEnabled(checked)
                }}
              />
            )}
          />
        }
      />
      <section className="settings-row-surface rounded-md p-3">
        <div className="mb-1 flex items-center gap-2 text-sm font-medium">
          <Map className="h-4 w-4 text-primary" />
          {t('settings.graphContentMode')}
        </div>
        <div className="mb-3 text-xs leading-5 text-muted-foreground">
          {t('settings.graphContentModeDescription')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Controller
            control={form.control}
            name="graphContentMode"
            render={({ field }) => (
              <>
                {graphContentModes.map((item) => (
                  <Button
                    key={item.value}
                    variant={field.value === item.value ? 'secondary' : 'outline'}
                    className="h-9 rounded-md"
                    onClick={() => {
                      field.onChange(item.value)
                      setGraphContentMode(item.value)
                    }}
                  >
                    {t(item.labelKey)}
                  </Button>
                ))}
              </>
            )}
          />
        </div>
      </section>
    </div>
  )
}

export default GraphSettingsPage
