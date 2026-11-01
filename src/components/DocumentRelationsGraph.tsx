import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LocateFixed, Pin, PinOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { KnowledgeNodePreview } from '@/components/knowledge/KnowledgeNodePreview'
import {
  useDocumentRelations,
  type RelationDirection,
} from '@/components/knowledge/useDocumentRelations'
import { useI18n } from '@/i18n/useI18n'
import { pathToWorkspaceGraphRoute } from '@/logic/routing'
import { requestWorkspaceMapNodeFocus } from '@/utils/workspaceMapNavigation'

const KnowledgeGraphCanvas = lazy(() =>
  import('@/features/knowledge-graph/KnowledgeGraphCanvas').then((module) => ({
    default: module.KnowledgeGraphCanvas,
  })),
)

type DocumentRelationsGraphProps = {
  workspaceKey: string
  targetPath: string
  onOpenFile: (path: string) => void
}

export const DocumentRelationsGraph = ({
  workspaceKey,
  targetPath,
  onOpenFile,
}: DocumentRelationsGraphProps) => {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { query, centerPath, depth, setDepth, direction, setDirection, pinned, togglePinned } =
    useDocumentRelations(workspaceKey, targetPath)
  const [selection, setSelection] = useState<{ workspaceKey: string; id: string } | null>(null)
  const graph = query.data
  const selected =
    selection?.workspaceKey === workspaceKey
      ? graph?.nodes.find((node) => node.id === selection.id)
      : null
  const selectNode = (id: string | null) => setSelection(id ? { workspaceKey, id } : null)
  const openNode = (id: string) => {
    const node = graph?.nodes.find((candidate) => candidate.id === id)
    if (node?.kind === 'file' || node?.kind === 'preview') onOpenFile(node.path)
    else selectNode(id)
  }
  const locate = () => {
    requestWorkspaceMapNodeFocus({ nodeId: selected?.id ?? `file:${centerPath}`, workspaceKey })
    navigate(pathToWorkspaceGraphRoute())
  }
  const loading = (
    <p role="status" className="p-3 text-xs text-muted-foreground">
      {t('knowledgeGraph.loading')}
    </p>
  )

  return (
    <section
      className="rounded-md border border-sidebar-border bg-background/55 p-2"
      aria-label={t('knowledgeGraph.localRelations')}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-xs font-medium">{t('knowledgeGraph.localRelations')}</h3>
          <p className="truncate text-[11px] text-muted-foreground" title={centerPath}>
            {centerPath}
          </p>
        </div>
        <Button
          size="icon-sm"
          variant={pinned ? 'secondary' : 'ghost'}
          aria-pressed={pinned}
          aria-label={t(pinned ? 'knowledgeGraph.followDocument' : 'knowledgeGraph.pinCenter')}
          title={t(pinned ? 'knowledgeGraph.followDocument' : 'knowledgeGraph.pinCenter')}
          onClick={togglePinned}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t(pinned ? 'knowledgeGraph.centerPinned' : 'knowledgeGraph.followingDocument')}
      </p>
      <div className="my-2 flex gap-2">
        <Select value={String(depth)} onValueChange={(value) => setDepth(value === '2' ? 2 : 1)}>
          <SelectTrigger
            size="sm"
            className="min-w-0 flex-1 text-xs"
            aria-label={t('knowledgeGraph.depth')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">{t('knowledgeGraph.depthOne')}</SelectItem>
            <SelectItem value="2">{t('knowledgeGraph.depthTwo')}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={direction}
          onValueChange={(value) => setDirection(value as RelationDirection)}
        >
          <SelectTrigger
            size="sm"
            className="min-w-0 flex-1 text-xs"
            aria-label={t('knowledgeGraph.direction')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="both">{t('knowledgeGraph.bothDirections')}</SelectItem>
            <SelectItem value="incoming">{t('inspector.backlinks')}</SelectItem>
            <SelectItem value="outgoing">{t('inspector.outgoingLinks')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {query.isPending ? (
        loading
      ) : query.isError ? (
        <div role="alert" className="p-2 text-xs text-destructive">
          {t('knowledgeGraph.loadError')}
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            {t('actions.retry')}
          </Button>
        </div>
      ) : !graph || graph.nodes.length === 0 ? (
        <p className="p-2 text-xs text-muted-foreground">{t('knowledgeGraph.emptyRelations')}</p>
      ) : (
        <>
          <div className="relative h-64 overflow-hidden rounded border border-border/60">
            <Suspense fallback={loading}>
              <KnowledgeGraphCanvas
                graph={graph}
                workspaceKey={workspaceKey}
                viewKey={`document:${centerPath}:${depth}:${direction}`}
                selectedNodeId={selected?.id ?? null}
                onSelectNode={selectNode}
                onOpenNode={openNode}
              />
            </Suspense>
          </div>
          {graph.edges.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('knowledgeGraph.emptyRelations')}
            </p>
          )}
          {graph.truncated && (
            <p role="status" className="mt-2 text-xs text-muted-foreground">
              {t('knowledgeGraph.localLimit')}
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            {t('knowledgeGraph.selectionHint')}
          </p>
        </>
      )}
      {selected && (
        <div
          className="mt-2 rounded border border-border/60 p-2"
          aria-label={t('knowledgeGraph.selectedNode')}
        >
          <p className="truncate text-xs font-medium">{selected.label}</p>
          <p className="mb-2 truncate text-[11px] text-muted-foreground">{selected.path}</p>
          {selected.kind === 'file' && graph && (
            <KnowledgeNodePreview
              nodeId={selected.id}
              revision={graph.revision}
              workspaceKey={workspaceKey}
            />
          )}
          {selected.kind === 'missing' ? (
            <p className="text-xs text-muted-foreground">{t('knowledgeGraph.missingTarget')}</p>
          ) : (
            <Button
              className="mt-2"
              variant="secondary"
              size="sm"
              onClick={() => openNode(selected.id)}
            >
              {t('knowledgeGraph.openDocument')}
            </Button>
          )}
        </div>
      )}
      <Button className="mt-2 w-full text-xs" variant="outline" size="sm" onClick={locate}>
        <LocateFixed className="size-3.5" />
        {t('knowledgeGraph.locateInGraph')}
      </Button>
    </section>
  )
}
