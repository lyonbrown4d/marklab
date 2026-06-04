import { memo } from 'react'
import type {
  MarkdownBlock,
  MarkdownBlockCommit,
  MarkdownBlockViewModel,
} from '@/logic/markdownBlocks'
import { markdownBlockComponentRegistry } from '@/components/markdown/markdownComponentRegistry'

type MarkdownSurfaceBlockProps = {
  block: MarkdownBlock | MarkdownBlockViewModel
  onCommitBlock?: (commit: MarkdownBlockCommit) => void
}

const {
  blockquote: BlockquoteView,
  code: CodeBlockView,
  divider: DividerView,
  editableList: EditableListView,
  heading: HeadingView,
  paragraph: ParagraphView,
} = markdownBlockComponentRegistry

const MarkdownSurfaceBlock = ({ block, onCommitBlock }: MarkdownSurfaceBlockProps) => {
  const commitBlock = (text: string) => onCommitBlock?.({ id: block.id, text })

  if (block.kind === 'heading') {
    return (
      <HeadingView
        blockId={block.id}
        blockRole={'role' in block ? block.role : undefined}
        level={block.level}
        text={block.text}
        editable={block.editable}
        compact
        onCommit={commitBlock}
      />
    )
  }

  if (block.kind === 'blockquote') {
    return <BlockquoteView text={block.text} editable={block.editable} onCommit={commitBlock} />
  }

  if (block.kind === 'code') {
    return (
      <CodeBlockView
        text={block.text}
        language={block.language}
        editable={block.editable}
        onCommit={commitBlock}
      />
    )
  }

  if (block.kind === 'list') {
    return (
      <EditableListView
        ordered={block.ordered}
        items={block.items}
        editable={block.editable}
        onCommit={commitBlock}
      />
    )
  }

  if (block.kind === 'divider') {
    return <DividerView />
  }

  return (
    <ParagraphView text={block.text} editable={block.editable} compact onCommit={commitBlock} />
  )
}

export default memo(MarkdownSurfaceBlock)
