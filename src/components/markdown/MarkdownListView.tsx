import { memo, type ReactNode } from 'react'

type MarkdownListViewProps = {
  contentRef?: (element: HTMLElement | null) => void
  selected?: boolean
  ordered?: boolean
  children?: ReactNode
}

const MarkdownListView = ({
  contentRef,
  selected = false,
  ordered = false,
  children,
}: MarkdownListViewProps) => {
  const selectedClass = ''

  return (
    <div
      className={`marklab-md-block my-2 rounded-sm px-1 py-0.5 text-sm leading-7 ${selectedClass}`}
      data-markdown-list={ordered ? 'ordered' : 'bullet'}
      data-selected={selected ? 'true' : 'false'}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  )
}

export default memo(MarkdownListView)
