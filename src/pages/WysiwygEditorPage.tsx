import { lazy, memo, Suspense, useEffect, useMemo, useRef } from 'react'
import { useLatest } from 'ahooks'
import type { MarkdownEditorHandle } from '@/components/milkdown/markdownEditorTypes'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import { useI18n } from '@/i18n/useI18n'
import { onExportContentRequest } from '@/utils/exportContent'
import { useDocumentStats } from '@/pages/useDocumentStats'
import { cn } from '@/lib/utils'
const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))
const LARGE_MARKDOWN_VIEW_FADE_LIMIT = 30000
type WysiwygEditorPageProps = {
  activePath: string | null
  value: string
  onChange: (value: string) => void
  showStatusBar: boolean
}
const WysiwygEditorPage = ({
  activePath,
  value,
  onChange,
  showStatusBar,
}: WysiwygEditorPageProps) => {
  const { t } = useI18n()
  const editorRef = useRef<MarkdownEditorHandle | null>(null)
  const activePathRef = useLatest(activePath)
  const valueRef = useLatest(value)
  const stats = useDocumentStats(value, showStatusBar)
  const shouldAnimateView = value.length <= LARGE_MARKDOWN_VIEW_FADE_LIMIT
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
      bulletList: t('slash.bulletList'),
      orderedList: t('slash.orderedList'),
      taskList: t('slash.taskList'),
      image: t('slash.image'),
      codeBlock: t('slash.codeBlock'),
      table: t('slash.table'),
    }),
    [t],
  )

  useEffect(() => {
    return onExportContentRequest(({ expectedActivePath, respond }) => {
      if (typeof respond !== 'function') return
      if (expectedActivePath != null && activePathRef.current !== expectedActivePath) return
      respond(editorRef.current?.getMarkdown() ?? valueRef.current)
    })
  }, [activePathRef, valueRef])
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="editor-stage min-h-0 flex-1 overflow-hidden">
        <div className="editor-paper relative h-full w-full overflow-hidden">
          <div className={cn('h-full', shouldAnimateView && 'animate-[view-fade_140ms_ease-out]')}>
            <Suspense fallback={<EditorPaneFallback />}>
              <MarkdownEditor
                ref={editorRef}
                activePath={activePath}
                value={value}
                onChange={onChange}
                placeholder={t('editor.placeholder')}
                slashLabels={slashLabels}
              />
            </Suspense>
          </div>
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
