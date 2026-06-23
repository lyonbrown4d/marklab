import { memo } from 'react'
import type {
  MarkdownBlock,
  MarkdownBlockCommit,
  MarkdownBlockViewModel,
} from '@/logic/markdownBlocks'
import MarkdownSurfaceBlock from '@/components/markdown/MarkdownSurfaceBlock'

type MarkdownBlockSurfaceProps = {
  blocks: Array<MarkdownBlock | MarkdownBlockViewModel>
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}

const MarkdownBlockSurface = ({ blocks, onCommitBlock }: MarkdownBlockSurfaceProps) => {
  const interactive = blocks.some((block) => block.editable)

  return (
    <div
      className={interactive ? 'nodrag nopan flex flex-col gap-1.5' : 'flex flex-col gap-1.5'}
      onClick={(event) => {
        if (!interactive) return
        event.stopPropagation()
      }}
      onDoubleClick={(event) => {
        if (!interactive) return
        event.stopPropagation()
      }}
      onPointerDown={(event) => {
        if (!interactive) return
        event.stopPropagation()
      }}
    >
      {blocks.map((block) => (
        <MarkdownSurfaceBlock key={block.id} block={block} onCommitBlock={onCommitBlock} />
      ))}
    </div>
  )
}

export default memo(MarkdownBlockSurface)
