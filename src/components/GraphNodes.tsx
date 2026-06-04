import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { memo, useCallback, useMemo } from 'react'
import type { GraphNodeData } from '@/logic/graph'
import { resolveHeadingSectionCommit } from '@/logic/markdownBlockCommits'
import { createHeadingSectionViewModel, type MarkdownBlockCommit } from '@/logic/markdownBlocks'
import MarkdownBlockSurface from '@/components/MarkdownBlockSurface'

type ExternalGraphNode = Node<{ label: string; subtitle?: string; url: string }, 'external'>
type MissingGraphNode = Node<{ label: string; subtitle?: string }, 'missing'>
type HeadingGraphNode = Node<GraphNodeData, 'heading'>

export const ExternalNode = memo(({ data }: NodeProps<ExternalGraphNode>) => {
  return (
    <div className="rounded-md border border-amber-500/35 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
})

export const MissingNode = memo(({ data }: NodeProps<MissingGraphNode>) => {
  return (
    <div className="rounded-md border border-destructive/35 bg-card px-3 py-2 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="text-sm font-semibold">{data.label}</div>
      <div className="text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
})

export const HeadingNode = memo(({ id, data }: NodeProps<HeadingGraphNode>) => {
  const onUpdateTitle = data.onUpdateTitle
  const onUpdateContent = data.onUpdateContent
  const blocks = useMemo(
    () =>
      createHeadingSectionViewModel({
        headingId: id,
        level: data.level ?? 2,
        title: data.label,
        content: data.content,
        contentBlocks: data.contentBlocks,
        contentMode: data.contentMode ?? 'none',
        editable: Boolean(data.editable),
      }),
    [data.content, data.contentBlocks, data.contentMode, data.editable, data.label, data.level, id],
  )

  const commitBlock = useCallback(
    (commit: MarkdownBlockCommit) => {
      const resolution = resolveHeadingSectionCommit(blocks, commit)
      if (resolution.type === 'title') {
        onUpdateTitle?.(id, resolution.text)
        return
      }

      if (resolution.type === 'content') {
        onUpdateContent?.(id, resolution.text)
        return
      }

      if (resolution.type === 'blocks') {
        onUpdateContent?.(id, resolution.text, resolution.blocks)
      }
    },
    [blocks, id, onUpdateContent, onUpdateTitle],
  )

  return (
    <div
      className="w-[260px] rounded-md border border-primary/30 bg-card px-3 py-2 shadow-sm"
      data-graph-node-id={id}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <MarkdownBlockSurface blocks={blocks} onCommitBlock={commitBlock} />
      <div className="mt-1 px-1 text-xs text-muted-foreground">{data.subtitle}</div>
    </div>
  )
})
