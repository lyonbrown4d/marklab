import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import AppEmptyState from '@/components/AppEmptyState'
import { useI18n } from '@/i18n/useI18n'
import type { KnowledgeLinkReference, KnowledgeMissingReference } from '@/logic/knowledge'
import { CircleAlert, FileText, Link2, Network } from 'lucide-react'

const SectionEmptyState = ({ label }: { label: string }) => (
  <AppEmptyState
    compact
    className="min-h-14 flex-none rounded-md border-sidebar-border/70 bg-muted/20 px-3 py-3 md:p-3"
    role="note"
    title={label}
    titleClassName="text-[11px] font-normal text-muted-foreground"
    titleLevel={4}
  />
)

export const KnowledgeSection = ({
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
        <SectionEmptyState label={empty} />
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
                <FileText className="mt-0.5 text-muted-foreground" data-icon="inline-start" />
                <span className="min-w-0 flex flex-1 flex-col gap-1">
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

export const MissingLinksSection = ({
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
        <SectionEmptyState label={empty} />
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
                <Link2 className="mt-0.5 text-muted-foreground" data-icon="inline-start" />
                <span className="min-w-0 flex flex-1 flex-col gap-1">
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
