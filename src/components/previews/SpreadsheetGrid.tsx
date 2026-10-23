import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n/useI18n'
import { writeClipboardText } from '@/runtime/clipboard'
import { DataGrid, type Column, type ColumnWidths } from 'react-data-grid'
import '@/components/previews/spreadsheet-grid.css'
import {
  formatSpreadsheetCell,
  spreadsheetCellAddress,
  spreadsheetFormulaText,
} from '@/components/previews/spreadsheetCell'
import type { SpreadsheetPage, SpreadsheetCell } from '@/services/spreadsheetApi'

type SpreadsheetRow = { number: number; cells: string[]; metadata?: SpreadsheetCell[] }

const columnName = (index: number): string => {
  let value = index + 1
  let name = ''
  while (value > 0) {
    value -= 1
    name = String.fromCharCode(65 + (value % 26)) + name
    value = Math.floor(value / 26)
  }
  return name
}

type SpreadsheetGridProps = {
  page: SpreadsheetPage
  label: string
  columnWidths?: ColumnWidths
  onColumnWidthsChange?: (widths: ColumnWidths) => void
}

export const SpreadsheetGrid = ({
  page,
  label,
  columnWidths,
  onColumnWidthsChange,
}: SpreadsheetGridProps) => {
  const { t } = useI18n()
  const [selection, setSelection] = useState<{ value: string; address: string; formula: string }>()
  const selectedValue = selection?.value
  const [copyState, setCopyState] = useState<'idle' | 'pending' | 'copied' | 'failed'>('idle')
  const copyValue = async () => {
    if (selectedValue === undefined || copyState === 'pending') return
    setCopyState('pending')
    try {
      await writeClipboardText(selectedValue)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }
  const columns = useMemo<Column<SpreadsheetRow>[]>(
    () => [
      {
        key: 'row-number',
        name: '#',
        frozen: true,
        width: 64,
        resizable: false,
        renderCell: ({ row }) => row.number,
        cellClass: 'text-muted-foreground bg-muted/40 tabular-nums',
      },
      ...Array.from({ length: page.columns }, (_, index): Column<SpreadsheetRow> => ({
        key: String(index),
        name: columnName(index),
        width: 'minmax(200px, 1fr)',
        minWidth: 96,
        resizable: true,
        renderCell: ({ row }) => (
          <span title={row.cells[index] ?? ''}>{row.cells[index] ?? ''}</span>
        ),
      })),
    ],
    [page.columns],
  )
  const rows = useMemo<SpreadsheetRow[]>(
    () =>
      page.rows.map((cells, index) => ({
        number: page.offset + index + 1,
        cells: cells.map((value, column) =>
          formatSpreadsheetCell(page.cells?.[index]?.[column], value),
        ),
        metadata: page.cells?.[index],
      })),
    [page],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1">
        <span className="min-w-12 font-mono text-xs text-muted-foreground">
          {selection?.address ?? '—'}
        </span>
        <output
          aria-label={t('preview.spreadsheetFormula')}
          className="min-w-0 flex-1 select-text truncate font-mono text-xs"
          title={selection?.formula}
        >
          {selection?.formula ?? ''}
        </output>
        <Button
          size="xs"
          variant="ghost"
          disabled={selectedValue === undefined || copyState === 'pending'}
          onClick={() => void copyValue()}
        >
          {t('preview.spreadsheetCopyCell')}
        </Button>
        <span role="status" className="ml-2 text-xs text-muted-foreground">
          {copyState === 'copied'
            ? t('preview.spreadsheetCopied')
            : copyState === 'failed'
              ? t('preview.spreadsheetCopyFailed')
              : ''}
        </span>
      </div>
      <DataGrid
        onActivePositionChange={({ row, column }) => {
          const index = column ? Number(column.key) : -1
          setSelection(
            row && column && column.key !== 'row-number'
              ? {
                  value: row.cells[index] ?? '',
                  address: spreadsheetCellAddress(row.number - 1, index),
                  formula: spreadsheetFormulaText(row.metadata?.[index], row.cells[index] ?? ''),
                }
              : undefined,
          )
          setCopyState('idle')
        }}
        onCellCopy={({ row, column }, event) => {
          event.preventDefault()
          event.clipboardData.setData(
            'text/plain',
            column.key === 'row-number'
              ? String(row.number)
              : (row.cells[Number(column.key)] ?? ''),
          )
        }}
        aria-label={label}
        columns={columns}
        columnWidths={columnWidths}
        onColumnWidthsChange={onColumnWidthsChange}
        rows={rows}
        rowKeyGetter={(row) => row.number}
        rowHeight={30}
        headerRowHeight={32}
        className="h-full min-h-0 flex-1 border-0 font-mono text-xs [--rdg-background-color:hsl(var(--background))] [--rdg-border-color:hsl(var(--border))] [--rdg-color:hsl(var(--foreground))] [--rdg-header-background-color:hsl(var(--muted))] [--rdg-row-hover-background-color:hsl(var(--accent))] [--rdg-row-selected-background-color:hsl(var(--accent))] [--rdg-selection-color:hsl(var(--ring))]"
      />
    </div>
  )
}
