import { EditorStatusBar } from '@/components/EditorStatusBar'
import { useI18n } from '@/i18n/useI18n'
import type { DocumentStats } from '@/pages/useDocumentStats'
import type { ViewMode } from '@/store/appTypes'
import { useStore } from 'zustand'
import { activeHeadingStore } from '@/utils/editorNavigation'

export type EditorCursorPosition = {
  lineNumber: number
  column: number
}

export const EditorDocumentStatus = ({
  activePath,
  viewMode,
  stats,
  value,
  cursor,
}: {
  activePath: string | null
  viewMode: ViewMode
  stats: DocumentStats
  value: string
  cursor?: EditorCursorPosition | null
}) => {
  const { t } = useI18n()
  const activeHeading = useStore(activeHeadingStore, (state) =>
    activePath ? state.headingDetails[activePath] : null,
  )
  const scrollProgress = useStore(activeHeadingStore, (state) =>
    activePath ? state.scrollProgress[activePath] : undefined,
  )
  const extension = activePath?.split(/[\\/]/).pop()?.split('.').pop()?.toLowerCase()
  const format =
    extension === 'md' || extension === 'markdown'
      ? 'Markdown'
      : extension === 'ics'
        ? 'iCalendar'
        : extension?.toUpperCase() || 'Text'
  const firstNewline = value.indexOf('\n')
  const lineEnding = firstNewline > 0 && value[firstNewline - 1] === '\r' ? 'CRLF' : 'LF'

  return (
    <EditorStatusBar activePath={activePath} viewMode={viewMode}>
      {viewMode === 'wysiwyg' && activeHeading && (
        <span className="max-w-40 truncate" title={activeHeading.text}>
          # {activeHeading.text}
        </span>
      )}
      {viewMode === 'wysiwyg' && scrollProgress !== undefined && <span>{scrollProgress}%</span>}
      {cursor && (
        <span>
          Ln {cursor.lineNumber}, Col {cursor.column}
        </span>
      )}
      <span>
        {stats.lines} {t('status.lines')}
      </span>
      <span>
        {stats.words} {t('status.words')}
      </span>
      <span>
        {stats.characters} {t('status.characters')}
      </span>
      <span>{format}</span>
      <span>{lineEnding}</span>
    </EditorStatusBar>
  )
}
