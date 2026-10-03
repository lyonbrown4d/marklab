import { useState, type MouseEvent, type PointerEvent, type SyntheticEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy } from 'lucide-react'
import AppAlert from '@/components/AppAlert'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { sourceLanguageForPath } from '@/logic/sourceLanguages'
import { cn } from '@/lib/utils'
import { writeClipboardText } from '@/runtime/clipboard'
import { fsApi } from '@/services/fsApi'
import { MAX_WORKSPACE_TEXT_PREVIEW_BYTES } from '@/types/workspaceTextPreview'

export const MAX_SOURCE_PREVIEW_BYTES = MAX_WORKSPACE_TEXT_PREVIEW_BYTES
export const MAX_SOURCE_PREVIEW_CHARACTERS = 200_000
export const MAX_SOURCE_PREVIEW_LINES = 2_000
export const GRAPH_SOURCE_PREVIEW_BYTES = 16 * 1024
export const GRAPH_SOURCE_PREVIEW_CHARACTERS = 8_000
export const GRAPH_SOURCE_PREVIEW_LINES = 40

type SourcePreviewSurfaceProps = {
  path: string
  presentation?: 'embedded' | 'full' | 'graph'
  title: string
}

type CopyState = {
  path: string
  status: 'copied' | 'failed' | 'idle'
}

const previewLines = (content: string, maxCharacters: number, maxLines: number) => {
  const normalized = content.replace(/\r\n?/g, '\n')
  const characterLimited = normalized.slice(0, maxCharacters)
  const allLines = characterLimited.split('\n')
  const lines = allLines.slice(0, maxLines)
  return {
    lines,
    renderTruncated: characterLimited.length < normalized.length || allLines.length > maxLines,
  }
}

const stopChromeEvent = (event: SyntheticEvent) => {
  event.stopPropagation()
}

const SourcePreviewSurface = ({
  path,
  presentation = 'full',
  title,
}: SourcePreviewSurfaceProps) => {
  const { t } = useI18n()
  const language = sourceLanguageForPath(path)
  const graphPresentation = presentation === 'graph'
  const byteLimit = graphPresentation ? GRAPH_SOURCE_PREVIEW_BYTES : MAX_SOURCE_PREVIEW_BYTES
  const maxCharacters = graphPresentation
    ? GRAPH_SOURCE_PREVIEW_CHARACTERS
    : MAX_SOURCE_PREVIEW_CHARACTERS
  const maxLines = graphPresentation ? GRAPH_SOURCE_PREVIEW_LINES : MAX_SOURCE_PREVIEW_LINES
  const [copyState, setCopyState] = useState<CopyState>({ path, status: 'idle' })
  const currentCopyStatus = copyState.path === path ? copyState.status : 'idle'
  const sourceQuery = useQuery({
    queryKey: ['source-preview', path, byteLimit],
    queryFn: async () => {
      const preview = await fsApi.readTextPreview(path, byteLimit)
      const rendered = previewLines(preview.content, maxCharacters, maxLines)
      return {
        ...preview,
        ...rendered,
        truncated: preview.truncated || rendered.renderTruncated,
      }
    },
    gcTime: 0,
    retry: false,
  })

  const copySource = async () => {
    const content = sourceQuery.data?.content
    if (!content) return
    try {
      await writeClipboardText(content)
      setCopyState({ path, status: 'copied' })
    } catch {
      setCopyState({ path, status: 'failed' })
    }
  }

  const handleCopy = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    void copySource()
  }

  const handleCopyPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    event.stopPropagation()
  }

  if (sourceQuery.isLoading) {
    return <PreviewLoadingFallback label={t('preview.sourceLoading')} />
  }

  if (sourceQuery.isError) {
    return (
      <AppAlert role="alert" tone="destructive" title={t('preview.sourceFailed')}>
        {t('preview.sourceReadFailed')}
      </AppAlert>
    )
  }

  const data = sourceQuery.data
  if (!data) return null

  const copyLabel =
    currentCopyStatus === 'copied'
      ? t('preview.sourceCopied')
      : currentCopyStatus === 'failed'
        ? t('preview.sourceCopyFailed')
        : data.truncated
          ? t('preview.sourceCopyPreview')
          : t('preview.sourceCopy')

  return (
    <article
      aria-label={t('preview.sourceLabel', { title })}
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm',
        graphPresentation ? 'h-full min-h-0' : 'min-h-[20rem]',
      )}
      onClick={stopChromeEvent}
      onDoubleClick={stopChromeEvent}
      onPointerDown={stopChromeEvent}
    >
      <header className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border/80 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="secondary">{language.label}</Badge>
          <span className="truncate text-sm font-medium" title={title}>
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {data.truncated ? t('preview.sourceTruncated') : t('preview.sourceComplete')}
          </span>
        </div>
        <Button
          aria-label={copyLabel}
          className="h-7 shrink-0 px-2"
          disabled={!data.content}
          onClick={handleCopy}
          onPointerDown={handleCopyPointerDown}
          size="sm"
          type="button"
          variant="outline"
        >
          {currentCopyStatus === 'copied' ? (
            <Check aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
          {copyLabel}
        </Button>
      </header>
      {data.content ? (
        <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-3">
          <ol
            aria-label={t('preview.sourceLines')}
            className="list-decimal space-y-0 pl-12 font-mono text-xs leading-5 marker:select-none marker:text-muted-foreground"
          >
            {data.lines.map((line, index) => (
              <li key={index} className="min-w-max pl-3">
                <code className="select-text whitespace-pre">{line || '\u00a0'}</code>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <div className="flex min-h-64 items-center justify-center p-6 text-sm text-muted-foreground">
          {t('preview.sourceEmpty')}
        </div>
      )}
    </article>
  )
}

export default SourcePreviewSurface
