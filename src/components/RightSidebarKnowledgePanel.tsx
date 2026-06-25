import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { InspectorEmptyState } from '@/components/RightSidebarPrimitives'
import { useI18n } from '@/i18n/useI18n'
import type {
  KnowledgeInsights,
  KnowledgeLinkReference,
  KnowledgeMissingReference,
} from '@/logic/knowledge'
import { CircleAlert, FileText, Link2, Network } from 'lucide-react'

type RightSidebarKnowledgePanelProps = {
  targetPath: string | null
  targetLabel: string
  knowledge: KnowledgeInsights
  onOpenFile: (path: string) => void
  onOpenReference: (reference: KnowledgeLinkReference) => void
  onOpenMissing: (reference: KnowledgeMissingReference) => void
}

export const RightSidebarKnowledgePanel = ({
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

const KnowledgeSection = ({
  title,
  summary,
  empty,
  items,
  referenceCount,
  onOpen,
  onOpenReference,
}: {
  title: string
  summary: string
  empty: string
  items: KnowledgeLinkReference[]
  referenceCount: number
  onOpen?: (path: string) => void
  onOpenReference?: (item: KnowledgeLinkReference) => void
}) => {
  const { t } = useI18n()

  return (
    <section className="rounded-md border border-sidebar-border bg-background/45 p-1.5">
      <div className="mb-1.5 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Network className="size-3.5" />
            {title}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{summary}</div>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[10px]">
          {t('inspector.referenceCount', { count: referenceCount })}
        </Badge>
      </div>
      {items.length === 0 ? (
        <div className="px-1 py-2 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const context = item.firstContext || item.firstText || t('inspector.noContext')

            return (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                className="h-auto min-h-14 w-full items-start justify-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
                onClick={() => (onOpenReference ? onOpenReference(item) : onOpen?.(item.path))}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-xs font-medium">{item.label}</span>
                    <Badge variant="secondary" className="shrink-0 rounded px-1 py-0 text-[10px]">
                      {t('inspector.referenceCount', { count: item.count })}
                    </Badge>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {item.path}
                  </span>
                  <span className="block whitespace-normal text-[11px] leading-snug text-muted-foreground">
                    {t('inspector.firstContext')}: {context}
                  </span>
                  <span className="block text-[10px] font-medium text-muted-foreground">
                    {t('inspector.position', {
                      line: item.firstLine,
                      column: item.firstColumn,
                    })}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      )}
    </section>
  )
}

const MissingLinksSection = ({
  title,
  summary,
  empty,
  items,
  referenceCount,
  onOpen,
}: {
  title: string
  summary: string
  empty: string
  items: KnowledgeMissingReference[]
  referenceCount: number
  onOpen: (item: KnowledgeMissingReference) => void
}) => {
  const { t } = useI18n()

  return (
    <section className="rounded-md border border-sidebar-border bg-background/45 p-1.5">
      <div className="mb-1.5 flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <CircleAlert className="size-3.5" />
            {title}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{summary}</div>
        </div>
        <Badge variant="secondary" className="shrink-0 rounded px-1.5 py-0 text-[10px]">
          {t('inspector.referenceCount', { count: referenceCount })}
        </Badge>
      </div>
      {items.length === 0 ? (
        <div className="px-1 py-2 text-xs text-muted-foreground">{empty}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {items.map((item, index) => {
            const missingType = t(
              item.linkType === 'wiki'
                ? 'inspector.missingType.wiki'
                : 'inspector.missingType.markdown',
            )
            const context = item.context || t('inspector.noContext')

            return (
              <Button
                key={`${item.target}-${item.line}-${item.column}-${index}`}
                variant="ghost"
                size="sm"
                className="h-auto min-h-14 w-full items-start justify-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground"
                onClick={() => onOpen(item)}
              >
                <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-xs font-medium">{item.text}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className="shrink-0 rounded px-1 py-0 text-[10px]">
                      {missingType}
                    </Badge>
                    <span className="truncate">
                      {t('inspector.missingTarget')}: {item.target}
                    </span>
                  </span>
                  <span className="block whitespace-normal text-[11px] leading-snug text-muted-foreground">
                    {t('inspector.firstContext')}: {context}
                  </span>
                  <span className="block text-[10px] font-medium text-muted-foreground">
                    {t('inspector.position', { line: item.line, column: item.column })}
                  </span>
                </span>
              </Button>
            )
          })}
        </div>
      )}
    </section>
  )
}
