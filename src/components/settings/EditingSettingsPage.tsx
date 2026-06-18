import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useI18n } from '@/i18n/useI18n'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { SettingsSection, SettingsSwitchRow } from '@/components/settings/SettingsRow'
import ImmersiveSettingsSection from '@/components/settings/ImmersiveSettingsSection'

const editingSettingsSchema = z.object({
  motionSmoothScrolling: z.boolean(),
  motionAnimatedCursor: z.boolean(),
  motionAnimatedPanels: z.boolean(),
})

type EditingSettingsValues = z.infer<typeof editingSettingsSchema>

const EditingSettingsPage = () => {
  const { t } = useI18n()
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const setMotionSmoothScrolling = usePreferencesStore((state) => state.setMotionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const setMotionAnimatedCursor = usePreferencesStore((state) => state.setMotionAnimatedCursor)
  const motionAnimatedPanels = usePreferencesStore((state) => state.motionAnimatedPanels)
  const setMotionAnimatedPanels = usePreferencesStore((state) => state.setMotionAnimatedPanels)
  const form = useForm<EditingSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(editingSettingsSchema),
    values: {
      motionSmoothScrolling,
      motionAnimatedCursor,
      motionAnimatedPanels,
    },
  })

  return (
    <div className="space-y-4">
      <ImmersiveSettingsSection />

      <SettingsSection title={t('settings.motion')} description={t('settings.motionDescription')}>
        <div className="space-y-3">
          <Controller
            control={form.control}
            name="motionSmoothScrolling"
            render={({ field }) => (
              <SettingsSwitchRow
                title={t('settings.motionSmoothScrolling')}
                description={t('settings.motionSmoothScrollingDescription')}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setMotionSmoothScrolling(checked)
                }}
              />
            )}
          />
          <Controller
            control={form.control}
            name="motionAnimatedCursor"
            render={({ field }) => (
              <SettingsSwitchRow
                title={t('settings.motionAnimatedCursor')}
                description={t('settings.motionAnimatedCursorDescription')}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setMotionAnimatedCursor(checked)
                }}
              />
            )}
          />
          <Controller
            control={form.control}
            name="motionAnimatedPanels"
            render={({ field }) => (
              <SettingsSwitchRow
                title={t('settings.motionAnimatedPanels')}
                description={t('settings.motionAnimatedPanelsDescription')}
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setMotionAnimatedPanels(checked)
                }}
              />
            )}
          />
        </div>
      </SettingsSection>
    </div>
  )
}

export default EditingSettingsPage
