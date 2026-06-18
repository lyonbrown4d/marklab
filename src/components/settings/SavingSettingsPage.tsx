import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CloudCog } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { SettingsSection, SettingsSwitchRow } from '@/components/settings/SettingsRow'

const saveSettingsSchema = z.object({
  silentSave: z.boolean(),
})

type SaveSettingsValues = z.infer<typeof saveSettingsSchema>

const SavingSettingsPage = () => {
  const { t } = useI18n()
  const silentSave = usePreferencesStore((state) => state.silentSave)
  const setSilentSave = usePreferencesStore((state) => state.setSilentSave)
  const form = useForm<SaveSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(saveSettingsSchema),
    values: {
      silentSave,
    },
  })

  return (
    <div className="space-y-4">
      <SettingsSection
        title={t('settings.saveBehavior')}
        description={t('settings.detailedSaveDescription')}
        icon={CloudCog}
      >
        <div className="space-y-3">
          <Controller
            control={form.control}
            name="silentSave"
            render={({ field }) => (
              <SettingsSwitchRow
                title={t('settings.silentSave')}
                description={t('settings.silentSaveDescription')}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setSilentSave(checked)
                }}
              />
            )}
          />
          <Controller
            control={form.control}
            name="silentSave"
            render={({ field }) => (
              <SettingsSwitchRow
                title={t('settings.detailedSave')}
                description={t('settings.detailedSaveDescription')}
                checked={!field.value}
                onCheckedChange={(checked) => {
                  field.onChange(!checked)
                  setSilentSave(!checked)
                }}
              />
            )}
          />
        </div>
      </SettingsSection>
    </div>
  )
}

export default SavingSettingsPage
