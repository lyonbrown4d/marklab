import { Badge } from '@/components/ui/badge'
import type { WorkspaceKnowledgeSummary } from '@/logic/knowledge'
import { Database, FileText, Hash, Link2, Search } from 'lucide-react'
import type { ReactNode } from 'react'

type CommandSearchOverviewProps = {
  query: string
  filesCount: number
  headingsCount: number
  fullTextCount: number
  knowledgeSummary: WorkspaceKnowledgeSummary
}

const scopeHints = [
  { label: '@', description: 'files' },
  { label: '#', description: 'headings' },
  { label: '?', description: 'text' },
]

const CommandSearchOverview = ({
  query,
  filesCount,
  headingsCount,
  fullTextCount,
  knowledgeSummary,
}: CommandSearchOverviewProps) => {
  const hasQuery = query.trim().length > 0

  return (
    <div className="border-b border-border/80 bg-popover px-3 py-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <div className="truncate text-xs font-medium">
            {hasQuery ? 'Search center' : 'Quick open center'}
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
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Files"
          value={filesCount}
        />
        <OverviewMetric
          icon={<Hash className="h-3.5 w-3.5" />}
          label="Headings"
          value={headingsCount}
        />
        <OverviewMetric
          icon={<Database className="h-3.5 w-3.5" />}
          label="Text hits"
          value={fullTextCount}
        />
        <OverviewMetric
          icon={<Link2 className="h-3.5 w-3.5" />}
          label="Links"
          value={knowledgeSummary.internalLinkCount}
          detail={`${knowledgeSummary.missingLinkCount} missing`}
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
