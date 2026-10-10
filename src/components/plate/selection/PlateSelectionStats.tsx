import { BlockSelectionPlugin } from '@platejs/selection/react'
import { useEditorRef, useEditorSelection, usePluginOption } from 'platejs/react'
import { useI18n } from '@/i18n/useI18n'
import { getMarkdownDocumentStats } from '@/logic/markdownTextAnalysis'

export const PlateSelectionStats = () => {
  const { t } = useI18n()
  const editor = useEditorRef()
  const selection = useEditorSelection()
  const selectedIds = usePluginOption(BlockSelectionPlugin, 'selectedIds')
  const blockCount = selectedIds?.size ?? 0
  const hasTextSelection = blockCount === 0 && Boolean(selection && editor.api.isExpanded())
  const selectedText = hasTextSelection && selection ? editor.api.string(selection) : ''
  const stats = getMarkdownDocumentStats(selectedText)

  if (blockCount < 2 && !hasTextSelection) return null
  const blockLabel = t('plate.blockSelection.count', { count: blockCount })
  const textLabel = `${stats.words} ${t('status.words')} · ${stats.characters} ${t('status.characters')}`
  const blockSelection = blockCount >= 2

  return (
    <div
      aria-label={blockSelection ? blockLabel : textLabel}
      aria-live="polite"
      className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-primary/25 bg-background/90 px-2.5 py-1 text-xs font-medium text-primary shadow-sm backdrop-blur motion-reduce:transition-none"
      data-testid={blockSelection ? 'plate-block-selection-count' : 'plate-selection-stats'}
      role="status"
    >
      {blockSelection ? blockCount : textLabel}
    </div>
  )
}
