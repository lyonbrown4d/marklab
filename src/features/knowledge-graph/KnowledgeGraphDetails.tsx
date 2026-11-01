import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { KnowledgeNodePreview } from '@/components/knowledge/KnowledgeNodePreview'
import { graphNodeLocation, type GraphData, type GraphNode } from '@/logic/graph'

type Props = {
  active: boolean
  graph: GraphData
  node: GraphNode
  workspaceKey: string
  onClose: () => void
  onOpen: () => void
  onSelect: (id: string) => void
}

export const KnowledgeGraphDetails = ({
  active,
  graph,
  node,
  workspaceKey,
  onClose,
  onOpen,
  onSelect,
}: Props) => {
  const { t } = useI18n()
  const neighborIds = new Set(
    graph.edges
      .filter((edge) => edge.source === node.id || edge.target === node.id)
      .map((edge) => (edge.source === node.id ? edge.target : edge.source)),
  )
  const neighbors = graph.nodes.filter((candidate) => neighborIds.has(candidate.id))
  return (
    <aside
      aria-label={t('knowledgeGraph.details')}
      className="flex w-72 max-w-[45%] shrink-0 flex-col gap-3 overflow-y-auto border-l bg-card p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="min-w-0 break-words text-sm font-medium">{node.label}</h2>
        <Button
          aria-label={t('knowledgeGraph.clearSelection')}
          onClick={onClose}
          size="icon"
          variant="ghost"
        >
          <X className="size-4" />
        </Button>
      </div>
      <p className="break-all text-xs text-muted-foreground">{graphNodeLocation(node)}</p>
      {node.kind === 'missing' ? (
        <p className="text-sm text-muted-foreground">{t('knowledgeGraph.missing')}</p>
      ) : (
        <Button onClick={onOpen} size="sm">
          {t(node.kind === 'external' ? 'knowledgeGraph.openWebsite' : 'knowledgeGraph.open')}
        </Button>
      )}
      {active && node.kind === 'file' ? (
        <KnowledgeNodePreview
          nodeId={node.id}
          revision={graph.revision}
          workspaceKey={workspaceKey}
        />
      ) : null}
      {neighbors.length ? (
        <div className="space-y-1">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t('knowledgeGraph.neighbors')}
          </h3>
          {neighbors.map((neighbor) => (
            <Button
              className="h-auto w-full justify-start whitespace-normal text-left"
              key={neighbor.id}
              onClick={() => onSelect(neighbor.id)}
              size="sm"
              variant="ghost"
            >
              {neighbor.label}
            </Button>
          ))}
        </div>
      ) : null}
    </aside>
  )
}
