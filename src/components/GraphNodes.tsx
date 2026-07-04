import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { memo, useCallback, useMemo } from 'react'
import type { GraphNodeData } from '@/logic/graph'
import { resolveHeadingSectionCommit } from '@/logic/markdownBlockCommits'
import { createHeadingSectionViewModel, type MarkdownBlockCommit } from '@/logic/markdownBlocks'
import MarkdownBlockSurface from '@/components/MarkdownBlockSurface'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ExternalGraphNode = Node<{ label: string; subtitle?: string; url: string }, 'external'>
type MissingGraphNode = Node<{ label: string; subtitle?: string }, 'missing'>
type HeadingGraphNode = Node<GraphNodeData, 'heading'>
type PreviewGraphNode = Node<GraphNodeData, 'preview'>

const graphHandleClass = 'graph-node-handle'

const getGraphNodeA11yProps = (label: string, selected: boolean) => ({
  'aria-current': selected ? (true as const) : undefined,
  'aria-label': label,
  'aria-roledescription': 'graph node',
  role: 'group' as const,
})

export const ExternalNode = memo(({ data, selected }: NodeProps<ExternalGraphNode>) => {
  return (
    <div
      className={cn(
        'graph-node-shell graph-node-shell--external flex w-[190px] cursor-pointer flex-col gap-1 rounded-md px-3 py-2',
        selected && 'graph-node-shell--selected',
      )}
      data-graph-node-selected={selected}
      data-graph-node-kind="external"
      {...getGraphNodeA11yProps(data.label, selected)}
    >
      <Handle type="target" position={Position.Left} className={graphHandleClass} />
      <Handle type="source" position={Position.Right} className={graphHandleClass} />
      <div className="truncate text-sm font-semibold">{data.label}</div>
      {data.subtitle ? (
        <Badge
          variant="outline"
          className="max-w-full self-start truncate px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
        >
          {data.subtitle}
        </Badge>
      ) : null}
    </div>
  )
})

export const MissingNode = memo(({ data, selected }: NodeProps<MissingGraphNode>) => {
  return (
    <div
      className={cn(
        'graph-node-shell graph-node-shell--missing flex w-[190px] cursor-pointer flex-col gap-1 rounded-md px-3 py-2',
        selected && 'graph-node-shell--selected',
      )}
      data-graph-node-selected={selected}
      data-graph-node-kind="missing"
      {...getGraphNodeA11yProps(data.label, selected)}
    >
      <Handle type="target" position={Position.Left} className={graphHandleClass} />
      <Handle type="source" position={Position.Right} className={graphHandleClass} />
      <div className="truncate text-sm font-semibold">{data.label}</div>
      {data.subtitle ? (
        <Badge
          variant="outline"
          className="max-w-full self-start truncate px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
        >
          {data.subtitle}
        </Badge>
      ) : null}
    </div>
  )
})

export const HeadingNode = memo(({ id, data, selected }: NodeProps<HeadingGraphNode>) => {
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
  const headingWidthClass =
    data.contentMode === 'full'
      ? 'w-[260px]'
      : data.contentMode === 'summary' && data.content
        ? 'w-[240px]'
        : 'w-[180px]'

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
      className={cn(
        'graph-node-shell graph-node-shell--heading rounded-md px-3 py-2',
        headingWidthClass,
        selected && 'graph-node-shell--selected',
      )}
      data-graph-node-selected={selected}
      data-graph-node-id={id}
      data-graph-node-kind="heading"
      {...getGraphNodeA11yProps(data.label, selected)}
    >
      <Handle type="target" position={Position.Left} className={graphHandleClass} />
      <Handle type="source" position={Position.Right} className={graphHandleClass} />
      <MarkdownBlockSurface blocks={blocks} onCommitBlock={commitBlock} />
      {data.subtitle ? (
        <Badge
          variant="outline"
          className="mt-1 max-w-full self-start truncate px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
        >
          {data.subtitle}
        </Badge>
      ) : null}
    </div>
  )
})

export const PreviewNode = memo(({ data, selected }: NodeProps<PreviewGraphNode>) => {
  const target = data.target ?? data.path
  if (!target) return null

  return (
    <div
      className={cn(
        'graph-node-shell graph-node-shell--preview w-[320px] rounded-md p-2',
        selected && 'graph-node-shell--selected',
      )}
      data-graph-node-selected={selected}
      data-graph-node-kind="preview"
      {...getGraphNodeA11yProps(data.label, selected)}
    >
      <Handle type="target" position={Position.Left} className={graphHandleClass} />
      <Handle type="source" position={Position.Right} className={graphHandleClass} />
      <EmbeddedFilePreview
        className="border-0 shadow-none"
        documentPath={null}
        target={target}
        title={data.label}
      />
    </div>
  )
})
