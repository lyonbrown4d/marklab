import { memo } from 'react'

type MarkdownDividerViewProps = {
  selected?: boolean
}

const MarkdownDividerView = ({ selected = false }: MarkdownDividerViewProps) => {
  return (
    <div
      className={`marklab-md-block my-5 rounded-sm px-1 py-2`}
      data-selected={selected ? 'true' : 'false'}
    >
      <div className="h-px bg-border" />
    </div>
  )
}

export default memo(MarkdownDividerView)
