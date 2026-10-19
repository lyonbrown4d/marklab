import { lazy, Suspense } from 'react'
import AppAlert from '@/components/AppAlert'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { SourceCodeLines } from '@/components/previews/SourceCodeLines'
import {
  isDelimitedFilePath,
  isHtmlFilePath,
  isMermaidFilePath,
  isPlantUmlFilePath,
} from '@/logic/fileTypes'
import { useI18n } from '@/i18n/useI18n'

const PlantUmlPreview = lazy(() => import('@/components/previews/PlantUmlPreview'))
const MermaidPreview = lazy(() => import('@/components/previews/MermaidPreview'))
const HtmlPreviewSurface = lazy(() => import('@/components/previews/HtmlPreviewSurface'))
const SpreadsheetPreviewSurface = lazy(
  () => import('@/components/previews/SpreadsheetPreviewSurface'),
)

export const MAX_MERMAID_SOURCE_BYTES = 128 * 1024
export const MAX_MERMAID_SOURCE_LINES = 4_000

export const canRenderMermaidSource = (source: string) => {
  if (source.length > MAX_MERMAID_SOURCE_BYTES) return false
  let lines = 1
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n' && ++lines > MAX_MERMAID_SOURCE_LINES) return false
  }
  return new TextEncoder().encode(source).byteLength <= MAX_MERMAID_SOURCE_BYTES
}

export const hasSourceDocumentPreview = (path: string) =>
  isPlantUmlFilePath(path) ||
  isMermaidFilePath(path) ||
  isHtmlFilePath(path) ||
  isDelimitedFilePath(path)

type SourceDocumentPreviewProps = {
  path: string
  source: string
  title: string
  presentation?: 'embedded' | 'full' | 'graph'
}

const SourceDocumentPreview = ({
  path,
  source,
  title,
  presentation = 'full',
}: SourceDocumentPreviewProps) => {
  const { t } = useI18n()
  let preview
  if (isMermaidFilePath(path)) {
    if (!canRenderMermaidSource(source)) {
      return (
        <div className="space-y-3">
          <AppAlert role="alert" title={t('preview.sourceTooLarge')}>
            {t('preview.sourceTruncated')}
          </AppAlert>
          <SourceCodeLines
            label={t('preview.sourceLines')}
            languageId="plaintext"
            lines={source.slice(0, MAX_MERMAID_SOURCE_BYTES).split('\n', 2_000)}
          />
        </div>
      )
    }
    if (!source.trim())
      return <p className="p-4 text-muted-foreground">{t('preview.sourceEmpty')}</p>
    preview = <MermaidPreview source={source} />
  } else if (isPlantUmlFilePath(path)) {
    preview = <PlantUmlPreview source={source} />
  } else if (isHtmlFilePath(path)) {
    preview = <HtmlPreviewSurface source={source} title={title} presentation={presentation} />
  } else if (isDelimitedFilePath(path)) {
    preview = (
      <SpreadsheetPreviewSurface
        path={path}
        source={source}
        title={title}
        presentation={presentation}
      />
    )
  } else {
    return null
  }
  return (
    <Suspense fallback={<PreviewLoadingFallback label={t('preview.loading')} />}>
      {preview}
    </Suspense>
  )
}

export default SourceDocumentPreview
