import { memo } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { FileImage, FileQuestion, Link2 } from 'lucide-react'
import { GraphWebNode } from '@/components/GraphWebNode'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import type { GraphNodeData } from '@/logic/graph'
import { cn } from '@/lib/utils'
import { WorkspaceMapNodeResizeControl } from '@/pages/workspace-map/WorkspaceMapNodeResizeControl'
import { WorkspaceMapNodeDisclosure } from '@/pages/workspace-map/WorkspaceMapNodeDisclosure'

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
  ({ data, id, selected, type }: NodeProps<ReferenceNode>) => {
    const kind = type ?? 'preview'
    const Icon = iconByType[kind]
    const subtitle = getSubtitle(data)
    const disclosure = data.workspaceMapDisclosure
    if (disclosure?.collapsed) {
      return (
        <section
          aria-label={data.label}
          className={cn(
            'workspace-map-node flex h-[72px] w-[220px] items-center gap-2 overflow-visible rounded-lg px-3',
            selected && 'workspace-map-node--selected',
          )}
          data-workspace-map-kind={kind}
          data-workspace-map-collapsed="true"
          data-graph-node-selected={selected}
        >
          <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
          <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
          <div className="workspace-map-node__icon flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/45">
            <Icon aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
            {subtitle ? (
              <div className="truncate text-[11px] text-muted-foreground">{subtitle}</div>
            ) : null}
          </div>
          <WorkspaceMapNodeDisclosure collapsed nodeId={id} onToggle={disclosure.toggle} />
        </section>
      )
    }
    if (kind === 'external' && data.url && data.webView) {
      return (
        <section
          aria-label={data.label}
          className={cn(
            'workspace-map-node size-full min-h-[180px] min-w-[300px] overflow-visible rounded-xl',
            selected && 'workspace-map-node--selected',
          )}
          data-workspace-map-kind={kind}
          data-graph-node-selected={selected}
        >
          <WorkspaceMapNodeResizeControl minHeight={180} minWidth={300} />
          <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
          <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
          {disclosure ? (
            <div className="absolute right-2 top-2 z-10">
              <WorkspaceMapNodeDisclosure
                collapsed={false}
                nodeId={id}
                onToggle={disclosure.toggle}
              />
            </div>
          ) : null}
          <div className="size-full overflow-hidden rounded-[inherit]">
            <GraphWebNode
              active={data.webView.active}
              dragHandleClassName="workspace-map-web-drag-handle"
              id={id}
              label={data.label}
              onActivate={data.webView.activate}
              onDeactivate={data.webView.deactivate}
              selected={selected}
              subtitle={data.subtitle}
              url={data.url}
            />
          </div>
        </section>
      )
    }
    if (kind === 'preview' && data.previewKind && data.path) {
      return (
        <section
          aria-label={data.label}
          className={cn(
            'workspace-map-node flex size-full min-h-[180px] min-w-[280px] flex-col overflow-visible rounded-lg',
            selected && 'workspace-map-node--selected',
          )}
          data-workspace-map-kind={kind}
          data-graph-node-selected={selected}
        >
          <WorkspaceMapNodeResizeControl minHeight={180} minWidth={280} />
          <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
          <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
          {disclosure ? (
            <div className="absolute right-2 top-2 z-10">
              <WorkspaceMapNodeDisclosure
                collapsed={false}
                nodeId={id}
                onToggle={disclosure.toggle}
              />
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden rounded-[inherit]">
            <EmbeddedFilePreview
              className="h-full border-0 shadow-none"
              documentPath={null}
              target={data.path}
              title={data.label}
              variant="graph"
            />
          </div>
        </section>
      )
    }
    return (
      <div
        className={cn(
          'workspace-map-node flex size-full min-h-20 min-w-44 items-start gap-2 overflow-visible rounded-lg px-3 py-3',
          selected && 'workspace-map-node--selected',
        )}
        data-workspace-map-kind={kind}
        data-graph-node-selected={selected}
      >
        <WorkspaceMapNodeResizeControl
          minHeight={80}
          minWidth={176}
          maxHeight={480}
          maxWidth={640}
        />
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
        {disclosure ? (
          <WorkspaceMapNodeDisclosure collapsed={false} nodeId={id} onToggle={disclosure.toggle} />
        ) : null}
      </div>
    )
  },
)
