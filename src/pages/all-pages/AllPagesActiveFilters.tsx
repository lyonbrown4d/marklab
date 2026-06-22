import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AllPagesFilters } from '@/logic/allPages'
import type { AllPagesViewMode } from '@/logic/allPagesViews'

type AllPagesActiveFiltersProps = {
  filters: AllPagesFilters
  hasActiveFilters: boolean
  onClear: () => void
  t: (key: string, options?: Record<string, unknown>) => string
  viewMode: AllPagesViewMode
}

export const AllPagesActiveFilters = ({
  filters,
  hasActiveFilters,
  onClear,
  t,
  viewMode,
}: AllPagesActiveFiltersProps) => {
  const chips = [
    filters.query
      ? t('allPages.activeFilter.query', {
          value: filters.query,
        })
      : null,
    filters.folder !== 'all'
      ? t('allPages.activeFilter.folder', {
          value: filters.folder,
        })
      : null,
    filters.issuesOnly ? t('allPages.activeFilter.issues') : null,
    filters.sort !== 'title'
      ? t('allPages.activeFilter.sort', {
          value: t(`allPages.sort.${filters.sort}`),
        })
      : null,
    viewMode !== 'table'
      ? t('allPages.activeFilter.view', {
          value: t(`allPages.view.${viewMode}`),
        })
      : null,
  ].filter((chip): chip is string => Boolean(chip))

  return (
    <div className="mx-4 mb-4 rounded-lg border border-dashed border-border/80 bg-muted/20 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            {t('allPages.activeFilters')}
          </div>
          {hasActiveFilters ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <Badge key={chip} variant="secondary" className="rounded-md font-normal">
                  {chip}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t('allPages.activeFiltersEmpty')}</p>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start rounded-md md:self-auto"
          disabled={!hasActiveFilters}
          onClick={onClear}
        >
          <X data-icon="inline-start" />
          {t('allPages.clearFilters')}
        </Button>
      </div>
    </div>
  )
}
