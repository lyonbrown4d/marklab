import { useState, type ElementType } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Code2, FileText, GitGraph } from 'lucide-react'
import { normalizeDrawioEmbedUrl } from '@/logic/drawioEmbed'
import { useI18n } from '@/i18n/useI18n'
import type { FileViewKind, MarkdownAssetImportStrategy } from '@/store/appTypes'
import { useDrawioSettingsStore } from '@/store/useDrawioSettingsStore'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  SettingsField,
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

const drawioEditorModes = [
  { value: 'remote', labelKey: 'settings.drawioModeRemote' },
  { value: 'system', labelKey: 'settings.drawioModeSystem' },
] as const

const fileSettingsSchema = z.object({
  defaultFileView: z.enum(['edit', 'source', 'graph']),
  drawioEditorMode: z.enum(['remote', 'system']),
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
  const drawioEditorMode = useDrawioSettingsStore((state) => state.drawioEditorMode)
  const setDrawioEditorMode = useDrawioSettingsStore((state) => state.setDrawioEditorMode)
  const drawioEmbedUrl = useDrawioSettingsStore((state) => state.drawioEmbedUrl)
  const setDrawioEmbedUrl = useDrawioSettingsStore((state) => state.setDrawioEmbedUrl)
  const resetDrawioEmbedUrl = useDrawioSettingsStore((state) => state.resetDrawioEmbedUrl)
  const [drawioUrlError, setDrawioUrlError] = useState<string | null>(null)
  const form = useForm<FileSettingsValues>({
    mode: 'onChange',
    resolver: zodResolver(fileSettingsSchema),
    values: {
      defaultFileView: safeDefaultFileView,
      drawioEditorMode,
      markdownAssetImportStrategy,
    },
  })
  const commitDrawioUrl = (value: string) => {
    try {
      const normalized = normalizeDrawioEmbedUrl(value)
      setDrawioEmbedUrl(normalized)
      setDrawioUrlError(null)
    } catch {
      setDrawioUrlError(t('settings.drawioEmbedUrlInvalid'))
    }
  }

  const resetDrawioUrl = () => {
    resetDrawioEmbedUrl()
    setDrawioUrlError(null)
  }

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

      <SettingsSection title={t('settings.drawio')} description={t('settings.drawioDescription')}>
        <SettingsChoiceGrid columns={2}>
          <Controller
            control={form.control}
            name="drawioEditorMode"
            render={({ field }) => (
              <>
                {drawioEditorModes.map((item) => (
                  <SettingsChoiceButton
                    key={item.value}
                    selected={field.value === item.value}
                    onClick={() => {
                      field.onChange(item.value)
                      setDrawioEditorMode(item.value)
                    }}
                  >
                    <span className="truncate">{t(item.labelKey)}</span>
                  </SettingsChoiceButton>
                ))}
              </>
            )}
          />
        </SettingsChoiceGrid>

        <SettingsField
          title={t('settings.drawioEmbedUrl')}
          description={drawioUrlError ? drawioUrlError : t('settings.drawioEmbedUrlDescription')}
          disabled={drawioEditorMode !== 'remote'}
          control={
            <div className="flex w-[min(28rem,42vw)] items-center gap-2">
              <Input
                key={drawioEmbedUrl}
                defaultValue={drawioEmbedUrl}
                disabled={drawioEditorMode !== 'remote'}
                onBlur={(event) => commitDrawioUrl(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.currentTarget.blur()
                  }
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                disabled={drawioEditorMode !== 'remote'}
                onClick={resetDrawioUrl}
              >
                {t('settings.drawioEmbedUrlReset')}
              </Button>
            </div>
          }
        />
      </SettingsSection>
    </SettingsPageStack>
  )
}

export default FileSettingsPage
