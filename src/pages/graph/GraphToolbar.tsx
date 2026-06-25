import { FileText, Globe2, Heading2, Paperclip, RotateCcw, Search, Unlink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { GraphFilterKind, GraphFilterState, GraphFilterStats } from '@/logic/graphViewModel'

type GraphToolbarProps = {
  edgeCount: number
  filters: GraphFilterState
  hasActiveFilters: boolean
  nodeCount: number
  onFiltersChange: (filters: GraphFilterState) => void
  stats: GraphFilterStats
  t: (key: string) => string
  totalEdgeCount: number
  totalNodeCount: number
}

type FilterItem = {
  icon: LucideIcon
  kind: GraphFilterKind
  labelKey: string
}

const filterItems: FilterItem[] = [
  { icon: FileText, kind: 'file', labelKey: 'graph.filterFiles' },
  { icon: Heading2, kind: 'heading', labelKey: 'graph.filterHeadings' },
  { icon: Paperclip, kind: 'preview', labelKey: 'graph.filterPreview' },
  { icon: Globe2, kind: 'external', labelKey: 'graph.filterExternal' },
  { icon: Unlink, kind: 'missing', labelKey: 'graph.filterMissing' },
]

export const GraphToolbar = ({
  edgeCount,
  filters,
  hasActiveFilters,
  nodeCount,
  onFiltersChange,
  stats,
  t,
  totalEdgeCount,
  totalNodeCount,
}: GraphToolbarProps) => {
  const updateQuery = (query: string) => {
    onFiltersChange({ ...filters, query })
  }

  const selectedKinds = filterItems
    .filter((item) => filters.kinds[item.kind])
    .map((item) => item.kind)

  const updateKinds = (kinds: string[]) => {
    const enabledKinds = new Set(kinds)

    onFiltersChange({
      ...filters,
      kinds: {
        external: enabledKinds.has('external'),
        file: enabledKinds.has('file'),
        heading: enabledKinds.has('heading'),
        missing: enabledKinds.has('missing'),
        preview: enabledKinds.has('preview'),
      },
    })
  }

  return (
    <div className="pointer-events-auto absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-lg border border-border bg-card/95 p-2 text-xs text-muted-foreground shadow-sm backdrop-blur md:max-w-[720px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 md:w-60 md:flex-none">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('graph.searchPlaceholder')}
            className="h-7 rounded-md pl-7 text-xs"
            value={filters.query}
            placeholder={t('graph.searchPlaceholder')}
            onChange={(event) => updateQuery(event.target.value)}
          />
        </div>
        <Badge variant="secondary" className="h-7 rounded-md px-2 font-normal">
          {t('graph.visible')}: {nodeCount}/{totalNodeCount} {t('graph.nodes')} · {edgeCount}/
          {totalEdgeCount} {t('graph.edges')}
        </Badge>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            onClick={() =>
              onFiltersChange({
                query: '',
                kinds: {
                  external: true,
                  file: true,
                  heading: true,
                  missing: true,
                  preview: true,
                },
              })
            }
          >
            <RotateCcw data-icon="inline-start" />
            {t('graph.resetFilters')}
          </Button>
        ) : null}
      </div>
      <ToggleGroup
        type="multiple"
        value={selectedKinds}
        variant="outline"
        size="sm"
        className="flex flex-wrap items-center justify-start gap-1"
        aria-label="Graph node kind filters"
        onValueChange={updateKinds}
      >
        {filterItems.map((item) => {
          const Icon = item.icon

          return (
            <ToggleGroupItem
              key={item.kind}
              value={item.kind}
              className="h-7 gap-1 border-transparent px-2 text-xs data-[state=off]:text-muted-foreground data-[state=on]:border-border data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground"
              aria-label={t(item.labelKey)}
            >
              <Icon data-icon="inline-start" />
              {t(item.labelKey)}
              <Badge variant="outline" className="h-4 rounded px-1 text-[10px] font-normal">
                {stats[item.kind]}
              </Badge>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}
