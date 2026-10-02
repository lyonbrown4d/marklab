import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { FileImage, FileQuestion, Link2 } from 'lucide-react'
import type { GraphNodeData } from '@/logic/graph'
import { cn } from '@/lib/utils'

type ReferenceNode = Node<GraphNodeData, 'external' | 'missing' | 'preview'>

const iconByType = {
  external: Link2,
  missing: FileQuestion,
  preview: FileImage,
} as const

const getSubtitle = (data: GraphNodeData) => {
  const subtitle = data.subtitle ?? data.path ?? data.target ?? data.url
  return typeof subtitle === 'string' ? subtitle : ''
}

export const WorkspaceMapReferenceNode = memo(
  ({ data, selected, type }: NodeProps<ReferenceNode>) => {
    const kind = type ?? 'preview'
    const Icon = iconByType[kind]
    const subtitle = getSubtitle(data)
    return (
      <div
        className={cn(
          'workspace-map-node flex h-24 w-[200px] items-start gap-2 rounded-lg px-3 py-3',
          selected && 'workspace-map-node--selected',
        )}
        data-workspace-map-kind={kind}
        data-graph-node-selected={selected}
      >
        <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
        <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
        <div className="workspace-map-node__icon flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/45">
          <Icon aria-hidden="true" className="size-4" />
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
          {subtitle ? (
            <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-muted-foreground">
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    )
  },
)
