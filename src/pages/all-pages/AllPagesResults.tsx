import { FileText, Folder, TriangleAlert } from 'lucide-react'
import { memo, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import type { AllPagesRow } from '@/logic/allPages'
import { groupAllPagesRowsByFolder, type AllPagesViewMode } from '@/logic/allPagesViews'

type AllPagesResultsProps = {
  hasActiveFilters: boolean
  onOpenFile: (path: string) => void
  onClearFilters: () => void
  rows: AllPagesRow[]
  t: (key: string, options?: Record<string, unknown>) => string
  viewMode: AllPagesViewMode
}

const formatter = new Intl.NumberFormat()

const count = (value: number) => formatter.format(value)
const metric = (value: number | null) => (value === null ? '...' : count(value))

const AllPagesResultsComponent = ({
  hasActiveFilters,
  onClearFilters,
  onOpenFile,
  rows,
  t,
  viewMode,
}: AllPagesResultsProps) => (
  <Card className="min-h-[420px] gap-0 overflow-hidden py-0">
    {rows.length === 0 ? (
      <AllPagesEmpty hasActiveFilters={hasActiveFilters} onClearFilters={onClearFilters} t={t} />
    ) : viewMode === 'cards' ? (
      <AllPagesCards onOpenFile={onOpenFile} rows={rows} t={t} />
    ) : viewMode === 'folders' ? (
      <AllPagesFolderBoard onOpenFile={onOpenFile} rows={rows} t={t} />
    ) : (
      <AllPagesTable onOpenFile={onOpenFile} rows={rows} t={t} />
    )}
  </Card>
)

export const AllPagesResults = memo(AllPagesResultsComponent)

AllPagesResults.displayName = 'AllPagesResults'

type ViewProps = {
  onOpenFile: (path: string) => void
  rows: AllPagesRow[]
  t: (key: string, options?: Record<string, unknown>) => string
}

const AllPagesEmpty = memo(
  ({
    hasActiveFilters,
    onClearFilters,
    t,
  }: Pick<AllPagesResultsProps, 'hasActiveFilters' | 'onClearFilters' | 't'>) => (
    <Empty className="min-h-[420px]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileText />
        </EmptyMedia>
        <EmptyTitle>{t('allPages.emptyTitle')}</EmptyTitle>
        <EmptyDescription>{t('allPages.emptyDescription')}</EmptyDescription>
        {hasActiveFilters ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-3 rounded-md"
            onClick={onClearFilters}
          >
            {t('allPages.clearFilters')}
          </Button>
        ) : null}
      </EmptyHeader>
    </Empty>
  ),
)

AllPagesEmpty.displayName = 'AllPagesEmpty'

const AllPagesTable = memo(({ onOpenFile, rows, t }: ViewProps) => (
  <div className="overflow-auto">
    <table className="w-full text-left text-sm">
      <thead className="sticky top-0 z-10 bg-card text-xs text-muted-foreground">
        <tr className="border-b border-border">
          <th className="px-4 py-3 font-medium">{t('allPages.columnTitle')}</th>
          <th className="hidden px-4 py-3 font-medium md:table-cell">
            {t('allPages.columnFolder')}
          </th>
          <th className="px-4 py-3 text-right font-medium">{t('allPages.columnHeadings')}</th>
          <th className="px-4 py-3 text-right font-medium">{t('allPages.columnLinks')}</th>
          <th className="hidden px-4 py-3 text-right font-medium lg:table-cell">
            {t('allPages.columnAssets')}
          </th>
          <th className="px-4 py-3 text-right font-medium">{t('allPages.columnIssues')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <AllPagesTableRow key={row.path} onOpenFile={onOpenFile} row={row} t={t} />
        ))}
      </tbody>
    </table>
  </div>
))

AllPagesTable.displayName = 'AllPagesTable'

type RowProps = {
  onOpenFile: (path: string) => void
  row: AllPagesRow
  t: (key: string, options?: Record<string, unknown>) => string
}

const AllPagesTableRow = memo(({ onOpenFile, row, t }: RowProps) => (
  <tr className="border-b border-border/70 transition-colors hover:bg-muted/35">
    <td className="min-w-0 px-4 py-2.5">
      <PageButton onOpenFile={onOpenFile} row={row} />
    </td>
    <td className="hidden max-w-48 px-4 py-2.5 text-muted-foreground md:table-cell">
      <span className="block truncate" title={row.folder}>
        {row.folder}
      </span>
    </td>
    <td className="px-4 py-2.5 text-right tabular-nums">{metric(row.headings)}</td>
    <td className="px-4 py-2.5 text-right tabular-nums">{metric(row.links)}</td>
    <td className="hidden px-4 py-2.5 text-right tabular-nums lg:table-cell">
      {metric(row.assets)}
    </td>
    <td className="px-4 py-2.5 text-right">
      <IssueCountBadge countValue={row.issues} t={t} />
    </td>
  </tr>
))

AllPagesTableRow.displayName = 'AllPagesTableRow'

const AllPagesCards = memo(({ onOpenFile, rows, t }: ViewProps) => (
  <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
    {rows.map((row) => (
      <AllPagesCard key={row.path} onOpenFile={onOpenFile} row={row} t={t} />
    ))}
  </div>
))

AllPagesCards.displayName = 'AllPagesCards'

const AllPagesCard = memo(({ onOpenFile, row, t }: RowProps) => (
  <button
    type="button"
    className="cursor-pointer rounded-lg border border-border bg-card p-4 text-left transition-colors duration-200 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    onClick={() => onOpenFile(row.path)}
  >
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-muted p-2">
        <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{row.title}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{row.path}</div>
      </div>
      <IssueCountBadge countValue={row.issues} t={t} />
    </div>
    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
      <Metric label={t('allPages.columnHeadings')} value={metric(row.headings)} />
      <Metric label={t('allPages.columnLinks')} value={metric(row.links)} />
      <Metric label={t('allPages.columnAssets')} value={metric(row.assets)} />
    </div>
  </button>
))

AllPagesCard.displayName = 'AllPagesCard'

const AllPagesFolderBoard = memo(({ onOpenFile, rows, t }: ViewProps) => {
  const groups = useMemo(() => groupAllPagesRowsByFolder(rows), [rows])

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-3">
      {groups.map((group) => (
        <section key={group.folder} className="min-w-0 rounded-lg border border-border bg-muted/20">
          <div className="border-b border-border p-4">
            <div className="flex min-w-0 items-center gap-2">
              <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <h2 className="truncate text-sm font-semibold" title={group.folder}>
                {group.folder}
              </h2>
              <Badge variant="outline" className="ml-auto rounded-md font-normal">
                {group.rows.length}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
              <span>
                {t('allPages.columnHeadings')}: {count(group.headings)}
              </span>
              <span>
                {t('allPages.columnLinks')}: {count(group.links)}
              </span>
              <span>
                {t('allPages.columnIssues')}: {count(group.issues)}
              </span>
            </div>
          </div>
          <div className="grid gap-2 p-2">
            {group.rows.map((row) => (
              <FolderPageButton key={row.path} onOpenFile={onOpenFile} row={row} t={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
})

AllPagesFolderBoard.displayName = 'AllPagesFolderBoard'

const FolderPageButton = memo(({ onOpenFile, row, t }: RowProps) => (
  <Button
    type="button"
    variant="ghost"
    className="h-auto cursor-pointer justify-start rounded-md px-2 py-2 text-left"
    onClick={() => onOpenFile(row.path)}
  >
    <FileText data-icon="inline-start" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm">{row.title}</span>
      <span className="block truncate text-xs text-muted-foreground">{row.path}</span>
    </span>
    {row.issues > 0 ? <IssueCountBadge countValue={row.issues} t={t} /> : null}
  </Button>
))

FolderPageButton.displayName = 'FolderPageButton'

const PageButton = memo(({ onOpenFile, row }: Omit<RowProps, 't'>) => (
  <Button
    type="button"
    variant="ghost"
    className="h-auto min-w-0 cursor-pointer justify-start rounded-md px-2 py-1 text-left"
    onClick={() => onOpenFile(row.path)}
  >
    <FileText data-icon="inline-start" />
    <span className="min-w-0">
      <span className="block truncate font-medium">{row.title}</span>
      <span className="block truncate text-xs text-muted-foreground">{row.path}</span>
    </span>
  </Button>
))

PageButton.displayName = 'PageButton'

const IssueCountBadge = memo(({ countValue, t }: { countValue: number; t: ViewProps['t'] }) =>
  countValue > 0 ? (
    <Badge variant="outline" className="rounded-md border-destructive/40 text-destructive">
      <TriangleAlert className="size-3" aria-hidden="true" />
      {count(countValue)}
    </Badge>
  ) : (
    <span className="text-muted-foreground">{t('common.no')}</span>
  ),
)

IssueCountBadge.displayName = 'IssueCountBadge'

const Metric = memo(({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md bg-muted/50 px-2 py-1.5">
    <div className="text-[11px]">{label}</div>
    <div className="mt-1 font-medium text-foreground">{value}</div>
  </div>
))

Metric.displayName = 'Metric'
