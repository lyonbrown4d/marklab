import { memo } from 'react'
import clamp from 'lodash-es/clamp'
import MarkdownEditableText from '@/components/markdown/MarkdownEditableText'

type MarkdownHeadingViewProps = {
  level: number
  text?: string
  editable?: boolean
  blockId?: string
  blockRole?: string
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  compact?: boolean
  onCommit?: (text: string) => void
}

const fullHeadingClasses: Record<number, string> = {
  1: 'text-3xl font-bold leading-tight',
  2: 'text-2xl font-bold leading-tight',
  3: 'text-xl font-semibold leading-snug',
  4: 'text-lg font-semibold leading-snug',
  5: 'text-base font-semibold leading-snug',
  6: 'text-sm font-semibold leading-snug text-muted-foreground',
}

const compactHeadingClasses: Record<number, string> = {
  1: 'text-lg font-bold leading-tight',
  2: 'text-base font-bold leading-tight',
  3: 'text-sm font-semibold leading-snug',
  4: 'text-[13px] font-semibold leading-snug',
  5: 'text-xs font-semibold leading-snug',
  6: 'text-xs font-medium leading-snug text-muted-foreground',
}

const getHeadingClass = (level: number, compact: boolean) => {
  const normalizedLevel = clamp(Math.trunc(level), 1, 6)
  return compact ? compactHeadingClasses[normalizedLevel] : fullHeadingClasses[normalizedLevel]
}

const normalizeHeadingText = (value: string) => value.trim()

const MarkdownHeadingView = ({
  level,
  text = '',
  editable = false,
  blockId,
  blockRole,
  contentRef,
  selected = false,
  compact = false,
  onCommit,
}: MarkdownHeadingViewProps) => {
  const headingClass = getHeadingClass(level, compact)
  const selectedClass = selected ? 'border-ring bg-accent/50' : 'border-transparent'

  if (contentRef) {
    return (
      <div
        className={`marklab-md-block rounded-sm border px-1 ${selectedClass} ${headingClass}`}
        data-selected={selected ? 'true' : 'false'}
      >
        <div ref={contentRef} />
      </div>
    )
  }

  return (
    <MarkdownEditableText
      className={`marklab-md-block nodrag rounded-sm border border-transparent px-1 outline-none focus:border-ring focus:bg-background ${headingClass}`}
      data-markdown-block-id={blockId}
      data-markdown-block-role={blockRole}
      data-selected={selected ? 'true' : 'false'}
      editable={editable}
      value={text}
      normalizeValue={normalizeHeadingText}
      commitOnEnter
      rejectEmpty
      onCommit={onCommit}
    />
  )
}

export default memo(MarkdownHeadingView)
