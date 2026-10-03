import { Suspense, lazy, memo, type SyntheticEvent, type WheelEvent } from 'react'
import type { Node, NodeProps } from '@xyflow/react'
import { Handle, Position } from '@xyflow/react'
import { ExternalLink, FileText, X } from 'lucide-react'
import { useMarkdownEditorSlashLabels } from '@/components/editor/useMarkdownEditorSlashLabels'
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
    return (
      <WorkspaceMapEmbeddedEditor
        data={data}
        editor={data.workspaceMapEditor}
        selected={selected}
      />
    )
  },
)

type WorkspaceMapEmbeddedEditorProps = {
  data: GraphNodeData
  editor?: NonNullable<GraphNodeData['workspaceMapEditor']>
  selected: boolean
}

const WorkspaceMapEmbeddedEditor = ({
  data,
  editor,
  selected,
}: WorkspaceMapEmbeddedEditorProps) => {
  const { t } = useI18n()
  const slashLabels = useMarkdownEditorSlashLabels()

  const handleWheel = (event: WheelEvent<HTMLElement>) => {
    if (editor && !event.ctrlKey && !event.metaKey) event.stopPropagation()
  }

  return (
    <section
      className={cn(
        'workspace-map-editor nodrag flex flex-col overflow-hidden rounded-lg',
        editor && 'nopan',
        selected && 'workspace-map-editor--selected',
      )}
      aria-label={editor ? `${t('workspaceMap.editing')} ${data.label}` : data.label}
      data-editor-active={editor ? 'true' : 'false'}
      data-testid="workspace-map-editor-surface"
      onClick={editor ? stopGraphEvent : undefined}
      onDoubleClick={stopGraphEvent}
      onKeyDown={editor ? stopGraphEvent : undefined}
      onKeyUp={editor ? stopGraphEvent : undefined}
      onMouseDown={editor ? stopGraphEvent : undefined}
      onPointerDown={editor ? stopGraphEvent : undefined}
      onWheel={handleWheel}
    >
      <Handle type="target" position={Position.Left} className="workspace-map-node__handle" />
      <Handle type="source" position={Position.Right} className="workspace-map-node__handle" />
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 bg-muted/30 px-3">
        <FileText aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-foreground">{data.label}</div>
          <div className="truncate text-[11px] text-muted-foreground" title={data.path}>
            {data.subtitle ?? data.path}
          </div>
        </div>
        {editor ? (
          <>
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
          </>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1 bg-background">
        {editor?.loadState.status === 'ready' ? (
          <Suspense fallback={<EditorPaneFallback label={t('workspaceMap.loadingDocument')} />}>
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
