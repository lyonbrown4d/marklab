import { memo } from 'react'
import MarkdownEditableText from '@/components/markdown/MarkdownEditableText'

type MarkdownParagraphViewProps = {
  text?: string
  editable?: boolean
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  compact?: boolean
  onCommit?: (text: string) => void
}

const MarkdownParagraphView = ({
  text = '',
  editable = false,
  contentRef,
  selected = false,
  compact = false,
  onCommit,
}: MarkdownParagraphViewProps) => {
  const sizeClass = compact
    ? 'max-h-28 overflow-hidden px-2 py-1.5 text-xs text-muted-foreground'
    : 'px-1 py-0.5 text-[0.9375rem]'

  if (contentRef) {
    return (
      <div
        className={`marklab-md-block rounded-sm leading-6 ${sizeClass}`}
        data-selected={selected ? 'true' : 'false'}
      >
        <div ref={contentRef} />
      </div>
    )
  }

  return (
    <MarkdownEditableText
      className={`nodrag whitespace-pre-wrap rounded-sm bg-transparent leading-5 outline-none focus:bg-transparent ${sizeClass}`}
      editable={editable}
      value={text}
      onCommit={onCommit}
    />
  )
}

export default memo(MarkdownParagraphView)
