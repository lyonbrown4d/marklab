import { lazy, memo, Suspense, useCallback, useEffect, useRef } from 'react'
import { useLatest } from 'ahooks'
import { basename, dirname, relative } from 'pathe'
import { toast } from 'sonner'
import type { MarkdownEditorHandle } from '@/components/editor/markdownEditorTypes'
import { useMarkdownEditorSlashLabels } from '@/components/editor/useMarkdownEditorSlashLabels'
import type { FileEntry } from '@/store/appTypes'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { fsApi } from '@/services/fsApi'
import { useI18n } from '@/i18n/useI18n'
import { normalizePath } from '@/logic/paths'
import { onExportContentRequest } from '@/utils/exportContent'
import { useDocumentStats } from '@/pages/useDocumentStats'
import { EditorDocumentStatus } from '@/components/EditorDocumentStatus'

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))

type WysiwygEditorPageProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  files: FileEntry[]
  showStatusBar: boolean
  readOnly: boolean
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
  readOnly,
}: WysiwygEditorPageProps) => {
  const { t } = useI18n()
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const activePathRef = useLatest(activePath)
  const valueRef = useLatest(value)
  const stats = useDocumentStats(value, showStatusBar)

  const slashLabels = useMarkdownEditorSlashLabels()
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
      const editor = editorRef.current
      if (!editor) {
        respond(valueRef.current)
        return
      }
      void editor.getMarkdown().then(respond, (error: unknown) => {
        console.error('Failed to serialize Markdown for export', error)
        respond(valueRef.current)
      })
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
              onCalendarFileCreate={readOnly ? undefined : onCalendarFileCreate}
              readOnly={readOnly}
            />
          </Suspense>
        </div>
      </div>
      {showStatusBar && activePath && (
        <EditorDocumentStatus
          activePath={activePath}
          viewMode="wysiwyg"
          stats={stats}
          value={value}
        />
      )}
    </div>
  )
}
export default memo(WysiwygEditorPage)
