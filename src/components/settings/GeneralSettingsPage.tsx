import type { ElementType } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Code2, GitGraph, PenLine } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { FileViewKind, MarkdownAssetImportStrategy } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsSection,
  SettingsSwitchRow,
} from '@/components/settings/SettingsRow'
import ImmersiveSettingsSection from '@/components/settings/ImmersiveSettingsSection'

const fileViews: Array<{ value: FileViewKind; labelKey: string; icon: ElementType }> = [
  { value: 'edit', labelKey: 'editor.modeWysiwyg', icon: PenLine },
  { value: 'source', labelKey: 'editor.modeSource', icon: Code2 },
  { value: 'graph', labelKey: 'tabs.graph', icon: GitGraph },
]

const assetImportStrategies: Array<{ value: MarkdownAssetImportStrategy; labelKey: string }> = [
  { value: 'copy-to-document-assets', labelKey: 'settings.assetStrategyCopy' },
  { value: 'preserve-path', labelKey: 'settings.assetStrategyPreserve' },
]

const generalSettingsSchema = z.object({
  silentSave: z.boolean(),
  showEditorStatusBar: z.boolean(),
  defaultFileView: z.enum(['edit', 'source', 'graph']),
  markdownAssetImportStrategy: z.enum(['copy-to-document-assets', 'preserve-path']),
  motionSmoothScrolling: z.boolean(),
  motionAnimatedCursor: z.boolean(),
  motionAnimatedPanels: z.boolean(),
})

type GeneralSettingsValues = z.infer<typeof generalSettingsSchema>

const GeneralSettingsPage = () => {
  const { t } = useI18n()
  const silentSave = usePreferencesStore((state) => state.silentSave)
  const setSilentSave = usePreferencesStore((state) => state.setSilentSave)
  const showEditorStatusBar = usePreferencesStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = usePreferencesStore((state) => state.setShowEditorStatusBar)
  const defaultFileView = usePreferencesStore((state) => state.defaultFileView)
  const setDefaultFileView = usePreferencesStore((state) => state.setDefaultFileView)
  const markdownAssetImportStrategy = usePreferencesStore(
    (state) => state.markdownAssetImportStrategy,
  )
  const setMarkdownAssetImportStrategy = usePreferencesStore(
    (state) => state.setMarkdownAssetImportStrategy,
  )
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const setMotionSmoothScrolling = usePreferencesStore((state) => state.setMotionSmoothScrolling)
  const motionAnimatedCursor = usePreferencesStore((state) => state.motionAnimatedCursor)
  const setMotionAnimatedCursor = usePreferencesStore((state) => state.setMotionAnimatedCursor)
  const motionAnimatedPanels = usePreferencesStore((state) => state.motionAnimatedPanels)
  const setMotionAnimatedPanels = usePreferencesStore((state) => state.setMotionAnimatedPanels)
  const form = useForm<GeneralSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(generalSettingsSchema),
    values: {
      silentSave,
      showEditorStatusBar,
      defaultFileView,
      markdownAssetImportStrategy,
      motionSmoothScrolling,
      motionAnimatedCursor,
      motionAnimatedPanels,
    },
  })

  return (
    <div className="space-y-4">
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
      <SettingsSection
        title={t('settings.defaultFileView')}
        description={t('settings.defaultFileViewDescription')}
      >
        <SettingsChoiceGrid columns={3}>
          <Controller
            control={form.control}
            name="defaultFileView"
            render={({ field }) => (
              <>
                {fileViews.map((item) => {
                  const Icon = item.icon
                  return (
                    <SettingsChoiceButton
                      key={item.value}
                      selected={field.value === item.value}
                      onClick={() => {
                        field.onChange(item.value)
                        setDefaultFileView(item.value)
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </SettingsChoiceButton>
                  )
                })}
              </>
            )}
          />
        </SettingsChoiceGrid>
      </SettingsSection>
      <SettingsSection
        title={t('settings.assetStrategy')}
        description={t('settings.assetStrategyDescription')}
      >
        <SettingsChoiceGrid columns={2}>
          <Controller
            control={form.control}
            name="markdownAssetImportStrategy"
            render={({ field }) => (
              <>
                {assetImportStrategies.map((item) => (
                  <SettingsChoiceButton
                    key={item.value}
                    selected={field.value === item.value}
                    onClick={() => {
                      field.onChange(item.value)
                      setMarkdownAssetImportStrategy(item.value)
                    }}
                  >
                    <span className="truncate">{t(item.labelKey)}</span>
                  </SettingsChoiceButton>
                ))}
              </>
            )}
          />
        </SettingsChoiceGrid>
      </SettingsSection>
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

export default GeneralSettingsPage
