import { memo } from 'react'
import MarkdownEditableText from '@/components/markdown/MarkdownEditableText'

type MarkdownCodeBlockViewProps = {
  text?: string
  language?: string
  editable?: boolean
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  onCommit?: (text: string) => void
}

const MarkdownCodeBlockView = ({
  text = '',
  language,
  editable = false,
  contentRef,
  selected = false,
  onCommit,
}: MarkdownCodeBlockViewProps) => {
  return (
    <div
      className="marklab-md-block nodrag overflow-hidden rounded-md border border-border/80 bg-muted/35 text-xs"
      data-selected={selected ? 'true' : 'false'}
    >
      {language ? (
        <div className="border-b border-border/70 px-2 py-1 font-medium text-muted-foreground">
          {language}
        </div>
      ) : null}
      <pre className="max-h-32 overflow-auto px-2 py-1.5 font-mono leading-5">
        {contentRef ? (
          <code
            ref={contentRef}
            className="block min-h-5 whitespace-pre-wrap rounded-sm outline-none focus:bg-transparent"
          />
        ) : (
          <MarkdownEditableText
            as="code"
            className="block min-h-5 whitespace-pre-wrap rounded-sm outline-none focus:bg-transparent"
            editable={editable}
            value={text}
            onCommit={onCommit}
          />
        )}
      </pre>
    </div>
  )
}

export default memo(MarkdownCodeBlockView)
