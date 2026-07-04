import { useState, type ElementType } from 'react'
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
        <SettingsChoiceGrid columns={3} aria-label={t('settings.defaultFileView')}>
          {fileViews.map((item) => {
            const Icon = item.icon
            return (
              <SettingsChoiceButton
                key={item.value}
                selected={safeDefaultFileView === item.value}
                onClick={() => setDefaultFileView(item.value)}
              >
                <Icon data-icon="inline-start" />
                <span className="truncate">{t(item.labelKey)}</span>
              </SettingsChoiceButton>
            )
          })}
        </SettingsChoiceGrid>
      </SettingsSection>

      <SettingsSection
        title={t('settings.assetStrategy')}
        description={t('settings.assetStrategyDescription')}
      >
        <SettingsChoiceGrid columns={2} aria-label={t('settings.assetStrategy')}>
          {assetImportStrategies.map((item) => (
            <SettingsChoiceButton
              key={item.value}
              selected={markdownAssetImportStrategy === item.value}
              onClick={() => setMarkdownAssetImportStrategy(item.value)}
            >
              <span className="truncate">{t(item.labelKey)}</span>
            </SettingsChoiceButton>
          ))}
        </SettingsChoiceGrid>
      </SettingsSection>

      <SettingsSection title={t('settings.drawio')} description={t('settings.drawioDescription')}>
        <SettingsChoiceGrid columns={2} aria-label={t('settings.drawio')}>
          {drawioEditorModes.map((item) => (
            <SettingsChoiceButton
              key={item.value}
              selected={drawioEditorMode === item.value}
              onClick={() => setDrawioEditorMode(item.value)}
            >
              <span className="truncate">{t(item.labelKey)}</span>
            </SettingsChoiceButton>
          ))}
        </SettingsChoiceGrid>

        <SettingsField
          title={t('settings.drawioEmbedUrl')}
          description={drawioUrlError ? drawioUrlError : t('settings.drawioEmbedUrlDescription')}
          disabled={drawioEditorMode !== 'remote'}
          control={
            <div className="flex w-full flex-col gap-2 sm:w-[min(28rem,42vw)] sm:flex-row sm:items-center">
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
                className="h-8 w-full shrink-0 sm:w-auto"
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
