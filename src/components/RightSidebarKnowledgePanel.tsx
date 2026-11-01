import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/AppScrollArea'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type {
  KnowledgeInsights,
  KnowledgeLinkReference,
  KnowledgeMissingReference,
} from '@/logic/knowledge'
import { FileText } from 'lucide-react'
import { KnowledgeSection, MissingLinksSection } from '@/components/RightSidebarKnowledgeLists'
import { DocumentRelationsGraph } from '@/components/DocumentRelationsGraph'

type RightSidebarKnowledgePanelProps = {
  workspaceKey: string
  targetPath: string | null
  targetLabel: string
  knowledge: KnowledgeInsights
  onOpenFile: (path: string) => void
  onOpenReference: (reference: KnowledgeLinkReference) => void
  onOpenMissing: (reference: KnowledgeMissingReference) => void
}

export const RightSidebarKnowledgePanel = ({
  workspaceKey,
  targetPath,
  targetLabel,
  knowledge,
  onOpenFile,
  onOpenReference,
  onOpenMissing,
}: RightSidebarKnowledgePanelProps) => {
  const { t } = useI18n()

  if (!targetPath) {
    return (
      <InspectorEmptyState
        icon={<FileText className="size-4" />}
        title={t('inspector.none')}
        description={t('editor.empty')}
      />
    )
  }

  return (
    <ScrollArea className="h-full" viewportClassName="p-1">
      <div className="flex flex-col gap-2">
        <DocumentRelationsGraph
          workspaceKey={workspaceKey}
          targetPath={targetPath}
          onOpenFile={onOpenFile}
        />
        <div className="rounded-md border border-sidebar-border bg-background/55 p-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-medium">{targetLabel}</div>
              <div className="text-[11px] text-muted-foreground">{t('inspector.knowledge')}</div>
            </div>
            {knowledge.orphan && (
              <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[10px]">
                {t('inspector.orphanNote')}
              </Badge>
            )}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px]">
            <Metric label={t('inspector.outgoingLinks')} value={knowledge.outgoingCount} />
            <Metric label={t('inspector.backlinks')} value={knowledge.incomingCount} />
            <Metric label={t('inspector.missingLinks')} value={knowledge.missingCount} />
          </div>
        </div>

        <KnowledgeSection
          title={t('inspector.outgoingLinks')}
          summary={t('inspector.knowledge.outgoingSummary', {
            count: knowledge.outgoingCount,
            items: knowledge.outgoing.length,
          })}
          empty={t('inspector.noOutgoingLinks')}
          items={knowledge.outgoing}
          referenceCount={knowledge.outgoingCount}
          onOpen={onOpenFile}
        />
        <KnowledgeSection
          title={t('inspector.backlinks')}
          summary={t('inspector.knowledge.incomingSummary', {
            count: knowledge.incomingCount,
            items: knowledge.incoming.length,
          })}
          empty={t('inspector.noBacklinks')}
          items={knowledge.incoming}
          referenceCount={knowledge.incomingCount}
          onOpenReference={onOpenReference}
        />
        <MissingLinksSection
          title={t('inspector.missingLinks')}
          summary={t('inspector.knowledge.missingSummary', { count: knowledge.missingCount })}
          empty={t('inspector.noMissingLinks')}
          items={knowledge.missing}
          referenceCount={knowledge.missingCount}
          onOpen={onOpenMissing}
        />
      </div>
    </ScrollArea>
  )
}

const Metric = ({ label, value }: { label: string; value: number }) => (
  <div className="rounded border border-sidebar-border/70 bg-muted/35 px-1.5 py-1">
    <div className="font-semibold text-foreground">{value}</div>
    <div className="truncate text-muted-foreground">{label}</div>
  </div>
)
