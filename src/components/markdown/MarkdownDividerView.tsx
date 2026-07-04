import { memo } from 'react'
import { Separator } from '@/components/ui/separator'

type MarkdownDividerViewProps = {
  selected?: boolean
}

const MarkdownDividerView = ({ selected = false }: MarkdownDividerViewProps) => {
  return (
    <div
      className={`marklab-md-block my-5 rounded-sm px-1 py-2`}
      data-selected={selected ? 'true' : 'false'}
    >
      <Separator />
    </div>
  )
}

export default memo(MarkdownDividerView)
