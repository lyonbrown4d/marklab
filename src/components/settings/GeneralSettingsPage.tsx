import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MonitorCog } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

const generalSettingsSchema = z.object({
  showEditorStatusBar: z.boolean(),
})

type GeneralSettingsValues = z.infer<typeof generalSettingsSchema>

const GeneralSettingsPage = () => {
  const { t } = useI18n()
  const showEditorStatusBar = usePreferencesStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = usePreferencesStore((state) => state.setShowEditorStatusBar)
  const form = useForm<GeneralSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(generalSettingsSchema),
    values: {
      showEditorStatusBar,
    },
  })

  return (
    <SettingsPageStack>
      <SettingsSection
        title={t('settings.general')}
        description={t('settings.statusBarDescription')}
        icon={MonitorCog}
      >
        <Controller
          control={form.control}
          name="showEditorStatusBar"
          render={({ field }) => (
            <SettingsSwitchRow
              title={t('settings.statusBar')}
              description={t('settings.statusBarDescription')}
              checked={field.value}
              onCheckedChange={(checked) => {
                field.onChange(checked)
                setShowEditorStatusBar(checked)
              }}
            />
          )}
        />
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default GeneralSettingsPage
