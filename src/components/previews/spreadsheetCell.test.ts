import { describe, expect, it } from 'vitest'
import {
  formatSpreadsheetCell,
  spreadsheetCellAddress,
  spreadsheetFormulaText,
} from '@/components/previews/spreadsheetCell'

describe('SheetJS visible cell formatting', () => {
  it('formats native numeric values using currency, percent and date formats', () => {
    expect(formatSpreadsheetCell({ value: 1234.5, format: '$#,##0.00' }, '')).toBe('$1,234.50')
    expect(formatSpreadsheetCell({ value: 0.125, format: '0.0%' }, '')).toBe('12.5%')
    expect(formatSpreadsheetCell({ value: 45292, format: 'yyyy-mm-dd' }, '')).toBe('2024-01-01')
    expect(formatSpreadsheetCell({ value: '你好，世界' }, '')).toBe('你好，世界')
    expect(formatSpreadsheetCell({ value: true }, '')).toBe('TRUE')
    expect(formatSpreadsheetCell(undefined, 'legacy')).toBe('legacy')
  })

  it('keeps formulas as text and encodes addresses beyond column Z', () => {
    expect(spreadsheetCellAddress(200, 26)).toBe('AA201')
    expect(spreadsheetFormulaText({ value: 4, formula: 'SUM(A1:A2)' }, '')).toBe('=SUM(A1:A2)')
    expect(spreadsheetFormulaText({ value: '<script>x</script>' }, '')).toBe('<script>x</script>')
    expect(formatSpreadsheetCell({ value: null }, 'old')).toBe('')
  })
})
