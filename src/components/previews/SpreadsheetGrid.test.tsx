import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SpreadsheetGrid } from '@/components/previews/SpreadsheetGrid'
import type { SpreadsheetCell } from '@/services/spreadsheetApi'
import { writeClipboardText } from '@/runtime/clipboard'

vi.mock('@/runtime/clipboard', () => ({ writeClipboardText: vi.fn() }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('react-data-grid', () => ({
  DataGrid: ({
    rows,
    onActivePositionChange,
  }: {
    rows: { number: number; cells: string[]; metadata?: SpreadsheetCell[] }[]
    onActivePositionChange: (args: {
      row: { number: number; cells: string[]; metadata?: SpreadsheetCell[] }
      column: { key: string }
    }) => void
  }) => (
    <button onClick={() => onActivePositionChange({ row: rows[0], column: { key: '0' } })}>
      Select cell
    </button>
  ),
}))
const page = {
  sheets: ['Sheet1'],
  sheet: 'Sheet1',
  columns: 1,
  totalRows: 1,
  offset: 0,
  rows: [['=SUM(A1)']],
  truncated: false,
}

describe('SpreadsheetGrid clipboard', () => {
  it('shows selected formula text and copies its formatted result', async () => {
    vi.mocked(writeClipboardText).mockResolvedValue(undefined)
    render(
      <SpreadsheetGrid
        page={{
          ...page,
          rows: [['0.125']],
          cells: [[{ value: 0.125, formula: 'A1/8', format: '0.0%' }]],
        }}
        label="Workbook"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Select cell' }))
    expect(screen.getByLabelText('preview.spreadsheetFormula')).toHaveTextContent('=A1/8')
    expect(screen.getByText('A1')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetCopyCell' }))
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith('12.5%'))
  })

  beforeEach(() => vi.resetAllMocks())

  it('copies the literal selected value through the runtime clipboard', async () => {
    vi.mocked(writeClipboardText).mockResolvedValue(undefined)
    render(<SpreadsheetGrid page={page} label="Workbook" />)
    const copy = screen.getByRole('button', { name: 'preview.spreadsheetCopyCell' })
    expect(copy).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Select cell' }))
    fireEvent.click(copy)
    await waitFor(() => expect(screen.getByText('preview.spreadsheetCopied')).toBeInTheDocument())
    expect(writeClipboardText).toHaveBeenCalledWith('=SUM(A1)')
  })

  it('reports clipboard failures without losing selection', async () => {
    vi.mocked(writeClipboardText).mockRejectedValue(new Error('Clipboard unavailable'))
    render(<SpreadsheetGrid page={page} label="Workbook" />)
    fireEvent.click(screen.getByRole('button', { name: 'Select cell' }))
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetCopyCell' }))
    await waitFor(() =>
      expect(screen.getByText('preview.spreadsheetCopyFailed')).toBeInTheDocument(),
    )
    expect(screen.getByRole('button', { name: 'preview.spreadsheetCopyCell' })).toBeEnabled()
  })
})
