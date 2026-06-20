import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CloudCog } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsFieldGroup,
  SettingsPageStack,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'

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
    <SettingsPageStack>
      <SettingsSection
        title={t('settings.saveBehavior')}
        description={t('settings.detailedSaveDescription')}
        icon={CloudCog}
      >
        <SettingsFieldGroup>
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
        </SettingsFieldGroup>
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default SavingSettingsPage
