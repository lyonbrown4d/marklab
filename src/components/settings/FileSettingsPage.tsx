import type { ElementType } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Code2, FileText, GitGraph } from 'lucide-react'
import { useI18n } from '@/i18n/useI18n'
import type { FileViewKind, MarkdownAssetImportStrategy } from '@/store/appTypes'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  SettingsChoiceButton,
  SettingsChoiceGrid,
  SettingsPageStack,
  SettingsSection,
} from '@/components/settings/SettingsRow'

type DefaultFileViewKind = Exclude<FileViewKind, 'preview'>

const fileViews: Array<{ value: DefaultFileViewKind; labelKey: string; icon: ElementType }> = [
  { value: 'edit', labelKey: 'editor.modeWysiwyg', icon: FileText },
  { value: 'source', labelKey: 'editor.modeSource', icon: Code2 },
  { value: 'graph', labelKey: 'tabs.graph', icon: GitGraph },
]

const assetImportStrategies: Array<{ value: MarkdownAssetImportStrategy; labelKey: string }> = [
  { value: 'copy-to-document-assets', labelKey: 'settings.assetStrategyCopy' },
  { value: 'preserve-path', labelKey: 'settings.assetStrategyPreserve' },
]

const fileSettingsSchema = z.object({
  defaultFileView: z.enum(['edit', 'source', 'graph']),
  markdownAssetImportStrategy: z.enum(['copy-to-document-assets', 'preserve-path']),
})

type FileSettingsValues = z.infer<typeof fileSettingsSchema>

const FileSettingsPage = () => {
  const { t } = useI18n()
  const defaultFileView = usePreferencesStore((state) => state.defaultFileView)
  const safeDefaultFileView: DefaultFileViewKind =
    defaultFileView === 'preview' ? 'edit' : defaultFileView
  const setDefaultFileView = usePreferencesStore((state) => state.setDefaultFileView)
  const markdownAssetImportStrategy = usePreferencesStore(
    (state) => state.markdownAssetImportStrategy,
  )
  const setMarkdownAssetImportStrategy = usePreferencesStore(
    (state) => state.setMarkdownAssetImportStrategy,
  )
  const form = useForm<FileSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(fileSettingsSchema),
    values: {
      defaultFileView: safeDefaultFileView,
      markdownAssetImportStrategy,
    },
  })

  return (
    <SettingsPageStack>
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
                      <Icon data-icon="inline-start" />
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
    </SettingsPageStack>
  )
}

export default FileSettingsPage
