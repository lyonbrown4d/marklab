import { memo } from 'react'
import MarkdownEditableText from '@/components/markdown/MarkdownEditableText'

type MarkdownBlockquoteViewProps = {
  text?: string
  editable?: boolean
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  onCommit?: (text: string) => void
}

const MarkdownBlockquoteView = ({
  text = '',
  editable = false,
  contentRef,
  selected = false,
  onCommit,
}: MarkdownBlockquoteViewProps) => {
  const selectedClass = selected ? 'ring-1 ring-ring bg-accent/40' : 'bg-muted/35'

  if (!contentRef) {
    return (
      <div
        className={`marklab-md-block nodrag my-2 rounded-sm border-l-2 border-primary/50 pl-3 ${selectedClass}`}
        data-selected={selected ? 'true' : 'false'}
      >
        <MarkdownEditableText
          className="whitespace-pre-wrap py-1 text-xs leading-5 text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
          editable={editable}
          value={text}
          onCommit={onCommit}
        />
      </div>
    )
  }

  return (
    <div
      className={`marklab-md-block my-3 rounded-sm border-l-2 border-primary/50 pl-3 ${selectedClass}`}
      data-selected={selected ? 'true' : 'false'}
    >
      <div ref={contentRef} className="space-y-1 py-1 text-muted-foreground" />
    </div>
  )
}

export default memo(MarkdownBlockquoteView)
