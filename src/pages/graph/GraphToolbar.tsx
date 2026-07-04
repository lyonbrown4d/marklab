import { memo, useCallback, useMemo, type KeyboardEvent } from 'react'
import { FileText, Globe2, Heading2, Paperclip, RotateCcw, Search, Unlink } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  createDefaultGraphFilters,
  type GraphFilterKind,
  type GraphFilterState,
  type GraphFilterStats,
} from '@/logic/graphViewModel'

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

const GraphToolbarComponent = ({
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
  const updateQuery = useCallback(
    (query: string) => {
      onFiltersChange({ ...filters, query })
    },
    [filters, onFiltersChange],
  )

  const handleQueryKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Escape' || filters.query.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      updateQuery('')
    },
    [filters.query.length, updateQuery],
  )

  const selectedKinds = useMemo(
    () => filterItems.filter((item) => filters.kinds[item.kind]).map((item) => item.kind),
    [filters.kinds],
  )

  const updateKinds = useCallback(
    (kinds: string[]) => {
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
    },
    [filters, onFiltersChange],
  )

  const resetFilters = useCallback(() => {
    onFiltersChange(createDefaultGraphFilters())
  }, [onFiltersChange])
  const statusLabel = `${t('graph.visible')}: ${nodeCount}/${totalNodeCount} ${t(
    'graph.nodes',
  )}, ${edgeCount}/${totalEdgeCount} ${t('graph.edges')}`

  return (
    <div className="graph-toolbar pointer-events-auto absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-col gap-2 rounded-lg border border-border bg-card/95 p-2 text-xs text-muted-foreground shadow-sm backdrop-blur md:max-w-[720px]">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1 md:w-60 md:flex-none">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t('graph.searchPlaceholder')}
            className="h-7 rounded-md pl-7 text-xs"
            value={filters.query}
            placeholder={t('graph.searchPlaceholder')}
            onChange={(event) => updateQuery(event.target.value)}
            onKeyDown={handleQueryKeyDown}
          />
        </div>
        <Badge
          variant="secondary"
          aria-atomic="true"
          aria-label={statusLabel}
          aria-live="polite"
          className="graph-toolbar__status h-7 rounded-md border border-transparent px-2 font-normal"
          data-active={hasActiveFilters ? 'true' : 'false'}
          role="status"
        >
          {t('graph.visible')}: {nodeCount}/{totalNodeCount} {t('graph.nodes')} · {edgeCount}/
          {totalEdgeCount} {t('graph.edges')}
        </Badge>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 rounded-md px-2 text-xs"
            onClick={resetFilters}
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
        aria-label={t('graph.filterGroup')}
        onValueChange={updateKinds}
      >
        {filterItems.map((item) => {
          const Icon = item.icon
          const count = stats[item.kind]
          const isSelected = filters.kinds[item.kind]
          const label = t(item.labelKey)

          return (
            <ToggleGroupItem
              key={item.kind}
              value={item.kind}
              className={cn(
                'graph-toolbar__filter h-7 min-w-0 gap-1 border-transparent px-2 text-xs data-[state=off]:text-muted-foreground data-[state=on]:border-border data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground',
                count === 0 && 'graph-toolbar__filter--empty',
              )}
              aria-label={`${label} (${count})`}
              aria-pressed={isSelected}
              data-selected={isSelected ? 'true' : 'false'}
            >
              <Icon aria-hidden="true" data-icon="inline-start" />
              <span className="truncate">{label}</span>
              <Badge
                variant="outline"
                className="graph-toolbar__filter-count h-4 rounded px-1 text-[10px] font-normal"
              >
                {count}
              </Badge>
            </ToggleGroupItem>
          )
        })}
      </ToggleGroup>
    </div>
  )
}

export const GraphToolbar = memo(GraphToolbarComponent)
GraphToolbar.displayName = 'GraphToolbar'
