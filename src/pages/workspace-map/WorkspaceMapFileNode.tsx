import { Suspense, lazy, memo, type SyntheticEvent } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { ExternalLink, FileText, X } from 'lucide-react'
import { useSlashCommandLabels } from '@/components/milkdown/useSlashCommandLabels'
import { Button } from '@/components/ui/button'
import EditorPaneFallback from '@/pages/EditorPaneFallback'
import type { GraphNodeData } from '@/logic/graph'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'

type WorkspaceMapFileGraphNode = Node<GraphNodeData, 'file'>

const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor'))

const stopGraphEvent = (event: SyntheticEvent) => event.stopPropagation()

export const WorkspaceMapFileNode = memo(
  ({ data, selected }: NodeProps<WorkspaceMapFileGraphNode>) => {
    const editor = data.workspaceMapEditor

    if (!editor) {
      return (
        <div
          className={cn(
            'workspace-map-node flex h-24 w-[200px] cursor-pointer items-start gap-2 rounded-lg px-3 py-3',
            selected && 'workspace-map-node--selected',
          )}
          data-graph-node-kind="file"
          data-graph-node-selected={selected}
        >
          <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
          <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/45 text-primary">
            <FileText aria-hidden="true" className="size-4" />
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
            <div className="mt-1 line-clamp-1 text-[11px] leading-4 text-muted-foreground">
              {data.subtitle ?? data.path}
            </div>
          </div>
        </div>
      )
    }

    return <WorkspaceMapEmbeddedEditor data={data} editor={editor} />
  },
)

type WorkspaceMapEmbeddedEditorProps = {
  data: GraphNodeData
  editor: NonNullable<GraphNodeData['workspaceMapEditor']>
}

const WorkspaceMapEmbeddedEditor = ({ data, editor }: WorkspaceMapEmbeddedEditorProps) => {
  const { t } = useI18n()
  const slashLabels = useSlashCommandLabels()

  return (
    <section
      className="workspace-map-editor nodrag nopan nowheel flex h-[520px] w-[560px] flex-col overflow-hidden rounded-lg"
      aria-label={`${t('workspaceMap.editing')} ${data.label}`}
      data-testid="workspace-map-editor-surface"
      onClick={stopGraphEvent}
      onDoubleClick={stopGraphEvent}
      onKeyDown={stopGraphEvent}
      onKeyUp={stopGraphEvent}
      onMouseDown={stopGraphEvent}
      onPointerDown={stopGraphEvent}
      onWheel={stopGraphEvent}
    >
      <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
      <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 bg-muted/30 px-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('workspaceMap.editing')}
          </div>
          <div className="truncate text-xs text-foreground" title={data.path}>
            {data.path}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('workspaceMap.openFullDocument')}
          title={t('workspaceMap.openFullDocument')}
          onClick={editor.onOpenFull}
        >
          <ExternalLink aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('workspaceMap.closeEditor')}
          title={t('workspaceMap.closeEditor')}
          onClick={editor.onClose}
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 bg-background">
        {editor.loadState.status === 'loading' ? (
          <EditorPaneFallback label={t('workspaceMap.loadingDocument')} path={data.path} />
        ) : editor.loadState.status === 'error' ? (
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
        ) : (
          <Suspense fallback={<EditorPaneFallback label={t('workspaceMap.loadingDocument')} />}>
            <MarkdownEditor
              activePath={data.path ?? null}
              value={editor.loadState.content}
              onChange={editor.onChange}
              placeholder={t('editor.placeholder')}
              slashLabels={slashLabels}
              readOnly={editor.readOnly}
              variant="embedded"
            />
          </Suspense>
        )}
      </div>
    </section>
  )
}
