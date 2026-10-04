import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { memo, useCallback, useMemo } from 'react'
import type { GraphNodeData } from '@/logic/graph'
import { FULL_HEADING_NODE_MAX_HEIGHT } from '@/logic/graphLayoutMetrics'
import { resolveHeadingSectionCommit } from '@/logic/markdownBlockCommits'
import { createHeadingSectionViewModel, type MarkdownBlockCommit } from '@/logic/markdownBlocks'
import MarkdownBlockSurface from '@/components/MarkdownBlockSurface'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, CornerDownRight, Plus } from 'lucide-react'

type FileGraphNode = Node<GraphNodeData, 'file'>
type MissingGraphNode = Node<{ label: string; subtitle?: string }, 'missing'>
type HeadingGraphNode = Node<GraphNodeData, 'heading'>

export type MindmapNodeActions = {
  addChild?: (nodeId: string) => void
  addSibling?: (nodeId: string) => void
  edit?: (nodeId: string) => void
}

const graphHandleClass = 'graph-node-handle'

const getGraphNodeA11yProps = (label: string, selected: boolean) => ({
  'aria-current': selected ? (true as const) : undefined,
  'aria-label': label,
  'aria-roledescription': 'graph node',
  role: 'group' as const,
})

const GraphBranchToggle = ({
  id,
  branch,
}: {
  id: string
  branch?: GraphNodeData['graphBranch']
}) => {
  if (!branch) return null
  return (
    <button
      type="button"
      className="graph-branch-toggle nodrag nopan"
      aria-expanded={!branch.collapsed}
      aria-label={branch.label}
      title={branch.title}
      onClick={(event) => {
        event.stopPropagation()
        branch.toggle(id)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {branch.collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
      {branch.collapsed ? (
        <span className="graph-branch-toggle__count" aria-hidden="true">
          {branch.descendantCount}
        </span>
      ) : null}
    </button>
  )
}

export const FileNode = memo(({ id, data, selected }: NodeProps<FileGraphNode>) => {
  return (
    <div
      className={cn(
        'graph-node-shell graph-node-shell--file flex w-[200px] cursor-pointer flex-col gap-1 rounded-md px-3 py-2',
        selected && 'graph-node-shell--selected',
      )}
      data-graph-node-selected={selected}
      data-graph-node-kind="file"
      {...getGraphNodeA11yProps(data.label, selected)}
    >
      <Handle type="target" position={Position.Left} className={graphHandleClass} />
      <Handle type="source" position={Position.Right} className={graphHandleClass} />
      <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
      {data.subtitle ? (
        <Badge
          variant="outline"
          className="max-w-full self-start truncate px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
        >
          {data.subtitle}
        </Badge>
      ) : null}
      <GraphBranchToggle id={id} branch={data.graphBranch} />
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
  const mindmap = (data as GraphNodeData & { mindmap?: MindmapNodeActions }).mindmap

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
      style={
        data.contentMode === 'full'
          ? {
              maxHeight: FULL_HEADING_NODE_MAX_HEIGHT,
              overflowY: 'auto',
            }
          : undefined
      }
      data-graph-node-selected={selected}
      data-graph-node-id={id}
      data-graph-node-kind="heading"
      {...getGraphNodeA11yProps(data.label, selected)}
      onDoubleClickCapture={(event) => {
        if (!mindmap?.edit || (event.target as Element).closest('button')) return
        event.preventDefault()
        mindmap.edit(id)
      }}
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
      {mindmap && selected ? (
        <div className="mindmap-branch-dock nodrag nopan" aria-label="Topic actions">
          {mindmap.addChild ? (
            <button
              type="button"
              aria-label="Add child topic"
              title="Add child topic (Tab)"
              onClick={() => mindmap.addChild?.(id)}
            >
              <Plus aria-hidden="true" />
            </button>
          ) : null}
          {mindmap.addSibling ? (
            <button
              type="button"
              aria-label="Add sibling topic"
              title="Add sibling topic (Enter)"
              onClick={() => mindmap.addSibling?.(id)}
            >
              <CornerDownRight aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : null}
      <GraphBranchToggle id={id} branch={data.graphBranch} />
    </div>
  )
})

export { ExternalNode, PreviewNode } from '@/components/GraphRichNodes'
