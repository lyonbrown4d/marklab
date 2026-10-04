import type { Node, NodeProps } from '@xyflow/react'
import { Handle, NodeResizer, Position } from '@xyflow/react'
import { memo } from 'react'
import type { GraphNodeData } from '@/logic/graph'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import { GraphWebNode } from '@/components/GraphWebNode'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type ExternalGraphNode = Node<GraphNodeData, 'external'>
type PreviewGraphNode = Node<GraphNodeData, 'preview'>

const graphHandleClass = 'graph-node-handle'
const resizeHandleClass = '!size-2 !border-primary/70 !bg-background'
const resizeLineClass = '!border-primary/55'

const getGraphNodeA11yProps = (label: string, selected: boolean) => ({
  'aria-current': selected ? (true as const) : undefined,
  'aria-label': label,
  'aria-roledescription': 'graph node',
  role: 'group' as const,
})

const GraphNodeResizer = ({
  selected,
  variant,
}: {
  selected: boolean
  variant: 'web' | 'file'
}) => {
  if (!selected) return null
  const minWidth = variant === 'web' ? 300 : 280
  const minHeight = variant === 'web' ? 180 : 140
  return (
    <NodeResizer
      handleClassName={resizeHandleClass}
      lineClassName={resizeLineClass}
      maxHeight={720}
      maxWidth={960}
      minHeight={minHeight}
      minWidth={minWidth}
    />
  )
}

export const ExternalNode = memo(({ id, data, selected }: NodeProps<ExternalGraphNode>) => {
  if (data.url && data.webView) {
    return (
      <div
        className={cn(
          'graph-node-shell graph-node-shell--external size-full min-h-[180px] min-w-[300px] overflow-visible rounded-lg p-0',
          selected && 'graph-node-shell--selected',
        )}
        data-graph-node-selected={selected}
        data-graph-node-kind="external"
        {...getGraphNodeA11yProps(data.label, selected)}
      >
        <GraphNodeResizer selected={selected} variant="web" />
        <Handle type="target" position={Position.Left} className={graphHandleClass} />
        <Handle type="source" position={Position.Right} className={graphHandleClass} />
        <div className="size-full overflow-hidden rounded-lg" data-graph-node-content>
          <GraphWebNode
            active={data.webView.active}
            id={id}
            label={data.label}
            onActivate={data.webView.activate}
            onDeactivate={data.webView.deactivate}
            selected={selected}
            subtitle={data.subtitle}
            url={data.url}
          />
        </div>
      </div>
    )
  }
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

export const PreviewNode = memo(({ data, selected }: NodeProps<PreviewGraphNode>) => {
  const target = data.target ?? data.path
  if (!target) return null

  return (
    <div
      className={cn(
        'graph-node-shell graph-node-shell--preview size-full min-h-[140px] min-w-[280px] overflow-visible rounded-md',
        selected && 'graph-node-shell--selected',
      )}
      data-graph-node-selected={selected}
      data-graph-node-kind="preview"
      {...getGraphNodeA11yProps(data.label, selected)}
    >
      <GraphNodeResizer selected={selected && data.graphResizable === true} variant="file" />
      <Handle type="target" position={Position.Left} className={graphHandleClass} />
      <Handle type="source" position={Position.Right} className={graphHandleClass} />
      <div className="size-full overflow-hidden rounded-md p-2" data-graph-node-content>
        <EmbeddedFilePreview
          className="h-full border-0 shadow-none"
          documentPath={null}
          target={target}
          title={data.label}
          variant="graph"
        />
      </div>
    </div>
  )
})
