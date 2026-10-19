import { utils, type CellObject } from 'xlsx'
import type { SpreadsheetCell } from '@/services/spreadsheetApi'

export const formatSpreadsheetCell = (
  cell: SpreadsheetCell | undefined,
  fallback: string,
): string => {
  if (!cell) return fallback
  if (cell.value === null) return ''
  const type = typeof cell.value === 'number' ? 'n' : typeof cell.value === 'boolean' ? 'b' : 's'
  const formatted: CellObject = {
    t: type,
    v: cell.value,
    ...(cell.format ? { z: cell.format } : {}),
  }
  return utils.format_cell(formatted)
}

export const spreadsheetCellAddress = (row: number, column: number): string =>
  utils.encode_cell({ r: row, c: column })

export const spreadsheetFormulaText = (
  cell: SpreadsheetCell | undefined,
  fallback: string,
): string =>
  cell?.formula ? `=${cell.formula.replace(/^=/, '')}` : cell ? String(cell.value ?? '') : fallback
