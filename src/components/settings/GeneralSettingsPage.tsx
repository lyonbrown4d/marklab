import type { ElementType } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Code2, GitGraph, PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useI18n } from '@/i18n/useI18n'
import {
  useAppStore,
  type FileViewKind,
  type MarkdownAssetImportStrategy,
} from '@/store/useAppStore'
import SettingsRow from '@/components/settings/SettingsRow'
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
  const silentSave = useAppStore((state) => state.silentSave)
  const setSilentSave = useAppStore((state) => state.setSilentSave)
  const showEditorStatusBar = useAppStore((state) => state.showEditorStatusBar)
  const setShowEditorStatusBar = useAppStore((state) => state.setShowEditorStatusBar)
  const defaultFileView = useAppStore((state) => state.defaultFileView)
  const setDefaultFileView = useAppStore((state) => state.setDefaultFileView)
  const markdownAssetImportStrategy = useAppStore((state) => state.markdownAssetImportStrategy)
  const setMarkdownAssetImportStrategy = useAppStore(
    (state) => state.setMarkdownAssetImportStrategy,
  )
  const motionSmoothScrolling = useAppStore((state) => state.motionSmoothScrolling)
  const setMotionSmoothScrolling = useAppStore((state) => state.setMotionSmoothScrolling)
  const motionAnimatedCursor = useAppStore((state) => state.motionAnimatedCursor)
  const setMotionAnimatedCursor = useAppStore((state) => state.setMotionAnimatedCursor)
  const motionAnimatedPanels = useAppStore((state) => state.motionAnimatedPanels)
  const setMotionAnimatedPanels = useAppStore((state) => state.setMotionAnimatedPanels)
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
      <SettingsRow
        title={t('settings.silentSave')}
        description={t('settings.silentSaveDescription')}
        control={
          <Controller
            control={form.control}
            name="silentSave"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setSilentSave(checked)
                }}
              />
            )}
          />
        }
      />
      <SettingsRow
        title={t('settings.detailedSave')}
        description={t('settings.detailedSaveDescription')}
        control={
          <Controller
            control={form.control}
            name="silentSave"
            render={({ field }) => (
              <Switch
                checked={!field.value}
                onCheckedChange={(checked) => {
                  field.onChange(!checked)
                  setSilentSave(!checked)
                }}
              />
            )}
          />
        }
      />
      <SettingsRow
        title={t('settings.statusBar')}
        description={t('settings.statusBarDescription')}
        control={
          <Controller
            control={form.control}
            name="showEditorStatusBar"
            render={({ field }) => (
              <Switch
                checked={field.value}
                onCheckedChange={(checked) => {
                  field.onChange(checked)
                  setShowEditorStatusBar(checked)
                }}
              />
            )}
          />
        }
      />
      <section className="settings-row-surface rounded-md p-3">
        <div className="mb-1 text-sm font-medium">{t('settings.defaultFileView')}</div>
        <div className="mb-3 text-xs leading-5 text-muted-foreground">
          {t('settings.defaultFileViewDescription')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Controller
            control={form.control}
            name="defaultFileView"
            render={({ field }) => (
              <>
                {fileViews.map((item) => {
                  const Icon = item.icon
                  return (
                    <Button
                      key={item.value}
                      variant={field.value === item.value ? 'secondary' : 'outline'}
                      className="h-9 justify-start rounded-md"
                      onClick={() => {
                        field.onChange(item.value)
                        setDefaultFileView(item.value)
                      }}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{t(item.labelKey)}</span>
                    </Button>
                  )
                })}
              </>
            )}
          />
        </div>
      </section>
      <section className="settings-row-surface rounded-md p-3">
        <div className="mb-1 text-sm font-medium">{t('settings.assetStrategy')}</div>
        <div className="mb-3 text-xs leading-5 text-muted-foreground">
          {t('settings.assetStrategyDescription')}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Controller
            control={form.control}
            name="markdownAssetImportStrategy"
            render={({ field }) => (
              <>
                {assetImportStrategies.map((item) => (
                  <Button
                    key={item.value}
                    variant={field.value === item.value ? 'secondary' : 'outline'}
                    className="h-9 justify-start rounded-md"
                    onClick={() => {
                      field.onChange(item.value)
                      setMarkdownAssetImportStrategy(item.value)
                    }}
                  >
                    <span className="truncate">{t(item.labelKey)}</span>
                  </Button>
                ))}
              </>
            )}
          />
        </div>
      </section>
      <ImmersiveSettingsSection />
      <section className="settings-row-surface space-y-3 rounded-md p-3">
        <div>
          <div className="mb-1 text-sm font-medium">{t('settings.motion')}</div>
          <div className="text-xs leading-5 text-muted-foreground">
            {t('settings.motionDescription')}
          </div>
        </div>
        <SettingsRow
          title={t('settings.motionSmoothScrolling')}
          description={t('settings.motionSmoothScrollingDescription')}
          control={
            <Controller
              control={form.control}
              name="motionSmoothScrolling"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                    setMotionSmoothScrolling(checked)
                  }}
                />
              )}
            />
          }
        />
        <SettingsRow
          title={t('settings.motionAnimatedCursor')}
          description={t('settings.motionAnimatedCursorDescription')}
          control={
            <Controller
              control={form.control}
              name="motionAnimatedCursor"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                    setMotionAnimatedCursor(checked)
                  }}
                />
              )}
            />
          }
        />
        <SettingsRow
          title={t('settings.motionAnimatedPanels')}
          description={t('settings.motionAnimatedPanelsDescription')}
          control={
            <Controller
              control={form.control}
              name="motionAnimatedPanels"
              render={({ field }) => (
                <Switch
                  checked={field.value}
                  onCheckedChange={(checked) => {
                    field.onChange(checked)
                    setMotionAnimatedPanels(checked)
                  }}
                />
              )}
            />
          }
        />
      </section>
    </div>
  )
}

export default GeneralSettingsPage
