import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n/useI18n'
import type { WorkspaceKnowledgeSummary } from '@/logic/knowledge'
import { Database, FileText, Hash, Link2, Search } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'

type CommandSearchOverviewProps = {
  query: string
  filesCount: number
  headingsCount: number
  fullTextCount: number
  knowledgeSummary: WorkspaceKnowledgeSummary
}

const CommandSearchOverview = ({
  query,
  filesCount,
  headingsCount,
  fullTextCount,
  knowledgeSummary,
}: CommandSearchOverviewProps) => {
  const { t } = useI18n()
  const hasQuery = query.trim().length > 0
  const scopeHints = useMemo(
    () => [
      { label: '@', description: t('command.search.scopeFiles') },
      { label: '#', description: t('command.search.scopeHeadings') },
      { label: '?', description: t('command.search.scopeText') },
    ],
    [t],
  )

  return (
    <div className="border-b border-border/80 bg-popover px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <div className="truncate text-xs font-medium">
            {hasQuery ? t('command.search.centerSearch') : t('command.search.centerQuickOpen')}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {scopeHints.map((hint) => (
            <Badge key={hint.label} variant="secondary" className="rounded px-1.5 py-0 text-[10px]">
              {hint.label} {hint.description}
            </Badge>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5 text-[11px]">
        <OverviewMetric
          icon={<FileText className="size-3.5" />}
          label={t('command.search.metricFiles')}
          value={filesCount}
        />
        <OverviewMetric
          icon={<Hash className="size-3.5" />}
          label={t('command.search.metricHeadings')}
          value={headingsCount}
        />
        <OverviewMetric
          icon={<Database className="size-3.5" />}
          label={t('command.search.metricTextHits')}
          value={fullTextCount}
        />
        <OverviewMetric
          icon={<Link2 className="size-3.5" />}
          label={t('command.search.metricLinks')}
          value={knowledgeSummary.internalLinkCount}
          detail={t('command.search.linksMissing', { count: knowledgeSummary.missingLinkCount })}
        />
      </div>
    </div>
  )
}

const OverviewMetric = ({
  detail,
  icon,
  label,
  value,
}: {
  detail?: string
  icon: ReactNode
  label: string
  value: number
}) => (
  <div className="flex min-w-0 items-center gap-1.5 rounded-md border border-border/80 bg-background/55 px-2 py-1.5">
    <span className="shrink-0 text-muted-foreground">{icon}</span>
    <span className="min-w-0">
      <span className="block truncate font-medium">{value}</span>
      <span className="block truncate text-muted-foreground">{detail ?? label}</span>
    </span>
  </div>
)

export default CommandSearchOverview
