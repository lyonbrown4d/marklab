import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef } from 'react'
import { useLatest } from 'ahooks'
import { basename, dirname, relative } from 'pathe'
import { toast } from 'sonner'
import type { MarkdownEditorHandle } from '@/components/milkdown/markdownEditorTypes'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import type { FileEntry } from '@/store/appTypes'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { fsApi } from '@/services/fsApi'
import { useI18n } from '@/i18n/useI18n'
import { normalizePath } from '@/logic/paths'
import { onExportContentRequest } from '@/utils/exportContent'
import { useDocumentStats } from '@/pages/useDocumentStats'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))

type WysiwygEditorPageProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  files: FileEntry[]
  showStatusBar: boolean
}

const INITIAL_ICS_CONTENT = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Marklab//Calendar//EN',
  'CALSCALE:GREGORIAN',
  'METHOD:PUBLISH',
  'END:VCALENDAR',
  '',
].join('\r\n')

const stripCalendarExtension = (path: string) => basename(path).replace(/\.ics$/i, '')

const normalizeCalendarInputPath = (input: string, activePath: string) => {
  let candidate = input.trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!candidate) {
    return null
  }

  if (!/\.ics$/i.test(candidate)) {
    candidate = `${candidate}.ics`
  }

  if (!candidate.includes('/')) {
    const directory = dirname(activePath)
    candidate = directory ? `${directory}/${candidate}` : candidate
  }

  return normalizePath(candidate)
}

const nextCalendarPath = (activePath: string, files: FileEntry[]) => {
  const existingPaths = new Set(files.map((file) => file.path.toLowerCase()))
  const directory = dirname(activePath)
  const createPath = (name: string) => (directory ? `${directory}/${name}` : name)

  for (let index = 0; index < 100; index += 1) {
    const filename = index === 0 ? 'calendar.ics' : `calendar-${index}.ics`
    const path = createPath(filename)
    if (!existingPaths.has(path.toLowerCase())) {
      return path
    }
  }

  return createPath(`calendar-${Date.now()}.ics`)
}

const relativeLinkTarget = (fromPath: string, targetPath: string) => {
  const target = relative(dirname(fromPath), targetPath)

  if (!target.includes('/') && !target.startsWith('.')) {
    return `./${target}`
  }

  return target
}

const markdownLinkForCalendar = (activePath: string, calendarPath: string) => {
  const label = stripCalendarExtension(calendarPath) || 'Calendar'
  const target = relativeLinkTarget(activePath, calendarPath).replace(/>/g, '%3E')
  return `[${label}](<${target}>)\n`
}

const WysiwygEditorPage = ({
  activePath,
  value,
  onChange,
  files,
  showStatusBar,
}: WysiwygEditorPageProps) => {
  const { t } = useI18n()
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const activePathRef = useLatest(activePath)
  const valueRef = useLatest(value)
  const stats = useDocumentStats(value, showStatusBar)

  const slashLabels = useMemo<SlashCommandLabels>(
    () => ({
      textGroup: t('slash.textGroup'),
      listGroup: t('slash.listGroup'),
      advancedGroup: t('slash.advancedGroup'),
      text: t('slash.text'),
      heading1: t('slash.heading1'),
      heading2: t('slash.heading2'),
      heading3: t('slash.heading3'),
      heading4: t('slash.heading4'),
      heading5: t('slash.heading5'),
      heading6: t('slash.heading6'),
      quote: t('slash.quote'),
      divider: t('slash.divider'),
      link: t('slash.link'),
      linkUrlPrompt: t('slash.linkUrlPrompt'),
      linkTextPrompt: t('slash.linkTextPrompt'),
      bold: t('slash.bold'),
      italic: t('slash.italic'),
      inlineCode: t('slash.inlineCode'),
      strike: t('slash.strike'),
      clearFormat: t('slash.clearFormat'),
      bulletList: t('slash.bulletList'),
      orderedList: t('slash.orderedList'),
      taskList: t('slash.taskList'),
      image: t('slash.image'),
      imageUrl: t('slash.imageUrl'),
      imageUrlPrompt: t('slash.imageUrlPrompt'),
      imageAltPrompt: t('slash.imageAltPrompt'),
      codeBlock: t('slash.codeBlock'),
      codeTypeScript: t('slash.codeTypeScript'),
      codeJavaScript: t('slash.codeJavaScript'),
      codeJson: t('slash.codeJson'),
      codeBash: t('slash.codeBash'),
      codeHtml: t('slash.codeHtml'),
      mermaid: t('slash.mermaid'),
      table: t('slash.table'),
      footnote: t('slash.footnote'),
      frontmatter: t('slash.frontmatter'),
      details: t('slash.details'),
      toc: t('slash.toc'),
      calloutNote: t('slash.calloutNote'),
      calloutTip: t('slash.calloutTip'),
      calloutImportant: t('slash.calloutImportant'),
      calloutWarning: t('slash.calloutWarning'),
      calloutCaution: t('slash.calloutCaution'),
      calendarFile: t('slash.calendarFile'),
      calendarFilePrompt: t('slash.calendarFilePrompt'),
    }),
    [t],
  )
  const onCalendarFileCreate = useCallback(async () => {
    if (!activePath) {
      return null
    }

    const defaultPath = nextCalendarPath(activePath, files)
    const input = window.prompt(t('slash.calendarFilePrompt'), basename(defaultPath))
    if (input === null) {
      return null
    }

    const calendarPath = normalizeCalendarInputPath(input, activePath)
    if (!calendarPath) {
      return null
    }

    const existingPaths = new Set(files.map((file) => file.path.toLowerCase()))
    if (existingPaths.has(calendarPath.toLowerCase())) {
      toast.error(t('calendar.fileExists'))
      return null
    }

    try {
      await fsApi.createFile(calendarPath)
      await fsApi.updateBuffer(calendarPath, INITIAL_ICS_CONTENT)
      await fsApi.flushBuffers()
      toast.success(t('calendar.fileCreated'))
      return markdownLinkForCalendar(activePath, calendarPath)
    } catch (error) {
      console.error('Failed to create calendar file', error)
      toast.error(t('calendar.createFailed'))
      return null
    }
  }, [activePath, files, t])

  useEffect(() => {
    return onExportContentRequest(({ expectedActivePath, respond }) => {
      if (typeof respond !== 'function') return
      if (expectedActivePath != null && activePathRef.current !== expectedActivePath) return
      respond(editorRef.current?.getMarkdown() ?? valueRef.current)
    })
  }, [activePathRef, valueRef])
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="h-full">
          <Suspense fallback={<EditorPaneFallback />}>
            <MarkdownEditor
              ref={editorRef}
              activePath={activePath}
              value={value}
              onChange={onChange}
              placeholder={t('editor.placeholder')}
              slashLabels={slashLabels}
              onCalendarFileCreate={onCalendarFileCreate}
            />
          </Suspense>
        </div>
      </div>
      {showStatusBar && activePath && (
        <div className="tab-strip flex h-7 items-center justify-between gap-3 border-t border-border/80 px-3 text-[11px] text-muted-foreground">
          <div className="min-w-0 truncate">{activePath}</div>
          <div className="flex shrink-0 items-center gap-3">
            <span>{t('editor.modeWysiwyg')}</span>
            <span>
              {stats.lines} {t('status.lines')}
            </span>
            <span>
              {stats.words} {t('status.words')}
            </span>
            <span>
              {stats.characters} {t('status.characters')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
export default memo(WysiwygEditorPage)
