import {
  Suspense,
  lazy,
  memo,
  type KeyboardEvent,
  type SyntheticEvent,
  type WheelEvent,
} from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { FileText, GripVertical } from 'lucide-react'
import { useMarkdownEditorSlashLabels } from '@/components/editor/useMarkdownEditorSlashLabels'
import { Button } from '@/components/ui/button'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import type { GraphNodeData } from '@/logic/graph'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import { isImeKeyboardEvent } from '@/logic/ime'
import { WORKSPACE_MAP_RESOURCE_DRAG_HANDLE_CLASS } from '@/pages/workspace-map/workspaceMapNodePresentation'
import { WorkspaceMapNodeResizeControl } from '@/pages/workspace-map/WorkspaceMapNodeResizeControl'
import { WorkspaceMapNodeDisclosure } from '@/pages/workspace-map/WorkspaceMapNodeDisclosure'
import { WorkspaceMapNodeToolbar } from '@/pages/workspace-map/WorkspaceMapNodeToolbar'
import { useWorkspaceMapNodeTools } from '@/pages/workspace-map/useWorkspaceMapNodeTools'

type WorkspaceMapFileGraphNode = Node<GraphNodeData, 'file'>

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))

const stopGraphEvent = (event: SyntheticEvent) => event.stopPropagation()

export const WorkspaceMapFileNode = memo(
  ({ data, id, selected }: NodeProps<WorkspaceMapFileGraphNode>) => {
    const tools = useWorkspaceMapNodeTools(id, Boolean(data.workspaceMapPinned))
    return (
      <>
        <WorkspaceMapNodeToolbar
          onClose={data.workspaceMapEditor?.onClose}
          onFocusRelations={tools.focusRelations}
          onOpenFull={data.workspaceMapEditor?.onOpenFull}
          onTogglePin={tools.togglePinned}
          pinned={tools.pinned}
          visible={selected || Boolean(data.workspaceMapEditor)}
        />
        <WorkspaceMapEmbeddedEditor
          data={data}
          editor={data.workspaceMapEditor}
          nodeId={id}
          selected={selected}
        />
      </>
    )
  },
)

type WorkspaceMapEmbeddedEditorProps = {
  data: GraphNodeData
  editor?: NonNullable<GraphNodeData['workspaceMapEditor']>
  nodeId: string
  selected: boolean
}

const WorkspaceMapEmbeddedEditor = ({
  data,
  editor,
  nodeId,
  selected,
}: WorkspaceMapEmbeddedEditorProps) => {
  const { t } = useI18n()
  const slashLabels = useMarkdownEditorSlashLabels()
  const disclosure = data.workspaceMapDisclosure

  if (disclosure?.collapsed && !editor) {
    return (
      <section
        className={cn(
          WORKSPACE_MAP_RESOURCE_DRAG_HANDLE_CLASS,
          'workspace-map-editor flex h-[112px] w-[248px] cursor-grab flex-col overflow-visible rounded-lg px-3 py-2.5 active:cursor-grabbing',
          selected && 'workspace-map-editor--selected',
        )}
        aria-label={data.label}
        data-editor-active="false"
        data-workspace-map-collapsed="true"
        data-testid="workspace-map-editor-surface"
      >
        <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
        <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
        <div className="flex w-full items-center gap-2">
          <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
            <div className="truncate text-[11px] text-muted-foreground" title={data.path}>
              {data.subtitle ?? data.path}
            </div>
          </div>
          <WorkspaceMapNodeDisclosure collapsed nodeId={nodeId} onToggle={disclosure.toggle} />
        </div>
        {data.content ? (
          <p className="line-clamp-2 w-full text-xs leading-5 text-muted-foreground">
            {data.content}
          </p>
        ) : null}
      </section>
    )
  }

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (editor && !event.ctrlKey && !event.metaKey) event.stopPropagation()
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!editor) return
    event.stopPropagation()
    if (event.defaultPrevented || isImeKeyboardEvent(event.nativeEvent)) return
    if (event.key !== 'Escape') return
    event.preventDefault()
    editor.onClose()
  }

  return (
    <section
      className={cn(
        'workspace-map-editor flex flex-col overflow-visible rounded-lg',
        selected && 'workspace-map-editor--selected',
      )}
      aria-label={editor ? `${t('workspaceMap.editing')} ${data.label}` : data.label}
      data-editor-active={editor ? 'true' : 'false'}
      data-testid="workspace-map-editor-surface"
    >
      {editor ? <WorkspaceMapNodeResizeControl minHeight={240} minWidth={320} /> : null}
      <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
      <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
      <header
        className={cn(
          WORKSPACE_MAP_RESOURCE_DRAG_HANDLE_CLASS,
          'flex h-11 shrink-0 cursor-grab items-center gap-2 rounded-t-[inherit] border-b border-border/70 bg-muted/30 px-3 active:cursor-grabbing',
        )}
        data-testid="workspace-map-resource-drag-handle"
      >
        <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
          <div className="truncate text-[11px] text-muted-foreground" title={data.path}>
            {data.subtitle ?? data.path}
          </div>
        </div>
        {!editor && disclosure ? (
          <WorkspaceMapNodeDisclosure
            collapsed={false}
            nodeId={nodeId}
            onToggle={disclosure.toggle}
          />
        ) : null}
      </header>
      <div
        className={cn(
          'relative min-h-0 flex-1 overflow-hidden rounded-b-[inherit] bg-background',
          editor && 'nodrag nopan',
        )}
        data-testid="workspace-map-editor-content"
        onClick={editor ? stopGraphEvent : undefined}
        onDoubleClick={stopGraphEvent}
        onKeyDown={handleKeyDown}
        onKeyUp={editor ? stopGraphEvent : undefined}
        onMouseDown={editor ? stopGraphEvent : undefined}
        onPointerDown={editor ? stopGraphEvent : undefined}
        onWheelCapture={handleWheel}
      >
        {editor?.loadState.status === 'ready' ? (
          <Suspense fallback={<EditorPaneFallback label={t('workspaceMap.loadingDocument')} />}>
            <div
              className="absolute inset-0 overflow-hidden [contain:strict] [&>div]:h-full [&>div]:min-h-0 [&>div]:overflow-hidden [&>div>div:first-child]:h-full [&>div>div:first-child]:min-h-0 [&>div>div:first-child]:overflow-hidden"
              data-testid="workspace-map-editor-viewport"
            >
              <MarkdownEditor
                activePath={data.path ?? null}
                autoFocus
                value={editor.loadState.content}
                onChange={editor.onChange}
                placeholder={t('editor.placeholder')}
                readOnly={editor.readOnly}
                slashLabels={slashLabels}
                variant="embedded"
              />
            </div>
          </Suspense>
        ) : editor?.loadState.status === 'loading' ? (
          <EditorPaneFallback label={t('workspaceMap.loadingDocument')} path={data.path} />
        ) : editor?.loadState.status === 'error' ? (
          <div className="flex h-full items-center justify-center p-6">
            <div
              className="w-full max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-5"
              role="alert"
            >
              <p className="text-sm font-semibold text-foreground">{t('editor.openFileFailed')}</p>
              {editor.loadState.message ? (
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  {editor.loadState.message}
                </p>
              ) : null}
              <Button className="mt-4" onClick={editor.onRetry} size="sm" variant="outline">
                {t('workspaceMap.retry')}
              </Button>
            </div>
          </div>
        ) : data.content ? (
          <div
            className="h-full overflow-hidden bg-muted/10 px-8 py-7 text-sm leading-6 text-foreground/85"
            data-testid="workspace-map-document-preview"
          >
            <p className="whitespace-pre-line break-words">{data.content}</p>
          </div>
        ) : (
          <div
            className="flex h-full flex-col items-center justify-center gap-4 bg-muted/10 px-12 text-center"
            data-testid="workspace-map-document-preview"
          >
            <div className="flex size-14 items-center justify-center rounded-xl border border-border/70 bg-card text-primary shadow-sm">
              <FileText aria-hidden="true" className="size-7" />
            </div>
            <div className="max-w-full">
              <p className="truncate text-base font-semibold text-foreground">{data.label}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {data.subtitle ?? data.path}
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
