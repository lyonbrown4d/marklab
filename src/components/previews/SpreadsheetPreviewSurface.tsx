import { useRef, useState } from 'react'
import { useDebounce, useInViewport } from 'ahooks'
import type { ColumnWidths } from 'react-data-grid'
import { useI18n } from '@/i18n/useI18n'
import { cn } from '@/lib/utils'
import AppAlert from '@/components/AppAlert'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PreviewLoadingFallback } from '@/components/previews/PreviewLoadingFallback'
import { SpreadsheetGrid } from '@/components/previews/SpreadsheetGrid'
import { SPREADSHEET_PAGE_SIZE, useSpreadsheetPage } from '@/components/previews/useSpreadsheetPage'

export type SpreadsheetPreviewSurfaceProps = {
  path: string
  source?: string
  src?: string
  title: string
  presentation?: 'embedded' | 'full' | 'graph'
}

const EMPTY_COLUMN_WIDTHS: ColumnWidths = new Map()

const SpreadsheetPageSurface = ({
  path,
  source,
  src,
  title,
  presentation,
}: SpreadsheetPreviewSurfaceProps) => {
  const { t } = useI18n()
  const viewportRef = useRef<HTMLElement>(null)
  const [inViewport] = useInViewport(viewportRef)
  const [sheet, setSheet] = useState<string>()
  const [offset, setOffset] = useState(0)
  const [recalculate, setRecalculate] = useState(false)
  const [columnWidthsBySheet, setColumnWidthsBySheet] = useState<ReadonlyMap<string, ColumnWidths>>(
    () => new Map(),
  )
  const excel = /\.(xlsx|xlsm)$/i.test(path)
  const query = useSpreadsheetPage(
    {
      path,
      source,
      assetUrl: src,
      sheet,
      offset,
      limit: SPREADSHEET_PAGE_SIZE,
      ...(excel ? { recalculate } : {}),
    },
    presentation === 'full' || inViewport === true,
  )
  const page = query.data

  return (
    <section
      ref={viewportRef}
      aria-label={t('preview.spreadsheetLabel', { name: title })}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background',
        presentation === 'full' ? 'h-full min-h-0' : 'h-[440px] min-h-80',
      )}
    >
      {excel ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            aria-pressed={recalculate}
            onClick={() => setRecalculate(!recalculate)}
          >
            {t(recalculate ? 'preview.spreadsheetSavedValues' : 'preview.spreadsheetCalculate')}
          </Button>
          <span className="text-xs text-muted-foreground" role="status">
            {t(recalculate ? 'preview.spreadsheetCalculatedMode' : 'preview.spreadsheetSavedMode')}
          </span>
        </div>
      ) : null}
      {page?.calculation?.warnings.map((warning, index) => (
        <p key={index} role="status" className="shrink-0 px-3 py-1 text-xs text-muted-foreground">
          {warning === 'SPREADSHEET_FORMATS_SIMPLIFIED'
            ? t('preview.spreadsheetFormatNote')
            : warning}
        </p>
      ))}
      {(page?.calculation?.errorCount ?? 0) > 0 ? (
        <p role="status" className="shrink-0 px-3 py-1 text-xs text-destructive">
          {t('preview.spreadsheetCalculationErrors', { count: page?.calculation?.errorCount })}
        </p>
      ) : null}
      {page ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
          {page.sheets.length > 0 ? (
            <Select
              value={page.sheet}
              onValueChange={(value) => {
                setSheet(value)
                setOffset(0)
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t('preview.spreadsheetSheet')}
                className="max-w-64"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {page.sheets.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <span className="text-xs text-muted-foreground" role="status">
            {t('preview.spreadsheetRows', {
              start: page.rows.length ? page.offset + 1 : 0,
              end: page.offset + page.rows.length,
              total: page.totalRows,
            })}
          </span>
          <div className="ml-auto flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - SPREADSHEET_PAGE_SIZE))}
            >
              {t('preview.spreadsheetPrevious')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={page.offset + page.rows.length >= page.totalRows}
              onClick={() => setOffset(offset + SPREADSHEET_PAGE_SIZE)}
            >
              {t('preview.spreadsheetNext')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        {query.isPending ? (
          <PreviewLoadingFallback label={t('preview.spreadsheetLoading')} />
        ) : null}
        {query.isError ? (
          <div className="p-4">
            <AppAlert
              tone="destructive"
              title={t('preview.spreadsheetFailed')}
              descriptionClassName="break-words"
            >
              {query.error.message}
            </AppAlert>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              onClick={() => void query.refetch()}
            >
              {t('preview.spreadsheetRetry')}
            </Button>
          </div>
        ) : null}
        {page && !query.isError ? (
          page.rows.length > 0 ? (
            <SpreadsheetGrid
              key={`${page.sheet}:${page.offset}:${recalculate}`}
              page={page}
              label={t('preview.spreadsheetLabel', { name: title })}
              columnWidths={columnWidthsBySheet.get(page.sheet) ?? EMPTY_COLUMN_WIDTHS}
              onColumnWidthsChange={(widths) =>
                setColumnWidthsBySheet((previous) => new Map(previous).set(page.sheet, widths))
              }
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">{t('preview.spreadsheetEmpty')}</p>
          )
        ) : null}
      </div>
      {page?.truncated ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {t('preview.spreadsheetTruncated')}
        </p>
      ) : null}
    </section>
  )
}

const DebouncedSpreadsheetPreview = (props: SpreadsheetPreviewSurfaceProps) => {
  const source = useDebounce(props.source, { wait: 250 })
  return (
    <SpreadsheetPageSurface
      key={JSON.stringify([props.path, props.src, source])}
      {...props}
      source={source}
    />
  )
}

const SpreadsheetPreviewSurface = ({
  presentation = 'full',
  ...props
}: SpreadsheetPreviewSurfaceProps) => (
  <DebouncedSpreadsheetPreview
    key={JSON.stringify([props.path, props.src])}
    {...props}
    presentation={presentation}
  />
)

export default SpreadsheetPreviewSurface
