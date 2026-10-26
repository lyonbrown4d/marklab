import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, ReactNode } from 'react'
import type { ColumnWidths } from 'react-data-grid'
import SpreadsheetPreviewSurface from '@/components/previews/SpreadsheetPreviewSurface'
import { spreadsheetApi } from '@/services/spreadsheetApi'

const viewport = vi.hoisted(() => ({ visible: true }))

vi.mock('ahooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('ahooks')>()),
  useInViewport: () => [viewport.visible],
}))

vi.mock('@/services/spreadsheetApi', () => ({ spreadsheetApi: { readPage: vi.fn() } }))
// The grid's virtual layout requires browser dimensions; keep the integration boundary explicit.
vi.mock('@/components/previews/SpreadsheetGrid', () => ({
  SpreadsheetGrid: ({
    page,
    columnWidths,
    onColumnWidthsChange,
  }: {
    page: { rows: string[][]; offset: number }
    columnWidths: ColumnWidths
    onColumnWidthsChange: (widths: ColumnWidths) => void
  }) => (
    <div role="grid">
      <output aria-label="First column width">{columnWidths.get('0')?.width ?? 'Default'}</output>
      <button
        onClick={() => onColumnWidthsChange(new Map([['0', { type: 'resized', width: 420 }]]))}
      >
        Resize first column
      </button>
      {page.rows.map((row, index) => (
        <div key={index}>
          {page.offset + index + 1}: {row.join('|')}
        </div>
      ))}
    </div>
  ),
}))
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode
    value: string
    onValueChange: (value: string) => void
  }) => (
    <select
      aria-label="Sheet"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      `${key}${values ? JSON.stringify(values) : ''}`,
  }),
}))

const page = {
  sheets: ['First', 'Second'],
  sheet: 'First',
  columns: 2,
  totalRows: 201,
  offset: 0,
  rows: [['header', 'value']],
  cells: [[{ value: 'header' }, { value: 'value' }]],
  calculation: { status: 'cached' as const, warnings: [], errorCount: 0 },
  truncated: false,
}
const renderPreview = (
  props: ComponentProps<typeof SpreadsheetPreviewSurface> = {
    path: '/report.xlsx',
    title: 'report.xlsx',
  },
) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<SpreadsheetPreviewSurface {...props} />, { wrapper })
}

describe('SpreadsheetPreviewSurface', () => {
  it('explains how to download a workbook that is still a Git LFS pointer', async () => {
    vi.mocked(spreadsheetApi.readPage).mockRejectedValueOnce(
      Object.assign(new Error('Pointer content missing'), { code: 'GIT_LFS_CONTENT_MISSING' }),
    )
    renderPreview()
    expect(await screen.findByRole('alert')).toHaveTextContent('preview.gitLfsContentMissing')
    expect(screen.getByRole('button', { name: 'preview.spreadsheetRetry' })).toBeEnabled()
  })

  it('retains resized columns across pages and calculation modes, isolating sheets and files', async () => {
    vi.mocked(spreadsheetApi.readPage).mockImplementation(async (request) => ({
      ...page,
      sheet: request.sheet ?? 'First',
      offset: request.offset ?? 0,
    }))
    const view = renderPreview()
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('button', { name: 'Resize first column' }))
    expect(screen.getByLabelText('First column width')).toHaveTextContent('420')

    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetNext' }))
    await screen.findByRole('grid')
    expect(screen.getByLabelText('First column width')).toHaveTextContent('420')
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetCalculate' }))
    await screen.findByRole('grid')
    expect(screen.getByLabelText('First column width')).toHaveTextContent('420')

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Second' } })
    await screen.findByRole('grid')
    expect(screen.getByLabelText('First column width')).toHaveTextContent('Default')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'First' } })
    await screen.findByRole('grid')
    expect(screen.getByLabelText('First column width')).toHaveTextContent('420')

    view.rerender(<SpreadsheetPreviewSurface path="/next.xlsx" title="next.xlsx" />)
    await screen.findByRole('grid')
    expect(screen.getByLabelText('First column width')).toHaveTextContent('Default')
  })

  it('calculates Excel formulas explicitly, retains mode across page and sheet changes, and resets on file change', async () => {
    vi.mocked(spreadsheetApi.readPage).mockImplementation(async (request) => ({
      ...page,
      sheet: request.sheet ?? 'First',
      offset: request.offset ?? 0,
      calculation: {
        status: request.recalculate ? 'recalculated' : 'cached',
        warnings: ['SPREADSHEET_FORMATS_SIMPLIFIED'],
        errorCount: request.recalculate ? 1 : 0,
      },
    }))
    const view = renderPreview()
    await screen.findByRole('grid')
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ recalculate: false }),
      expect.any(AbortSignal),
    )
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetCalculate' }))
    await screen.findByRole('grid')
    expect(screen.getByText('preview.spreadsheetFormatNote')).toBeInTheDocument()
    expect(screen.getByText('preview.spreadsheetCalculationErrors{"count":1}')).toBeInTheDocument()
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ recalculate: true }),
      expect.any(AbortSignal),
    )
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetNext' }))
    await screen.findByRole('grid')
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ recalculate: true, offset: 200 }),
      expect.any(AbortSignal),
    )
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Second' } })
    await screen.findByRole('grid')
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ recalculate: true, offset: 0, sheet: 'Second' }),
      expect.any(AbortSignal),
    )
    view.rerender(<SpreadsheetPreviewSurface path="/next.xlsx" title="next.xlsx" />)
    await screen.findByRole('grid')
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ recalculate: false, offset: 0, sheet: undefined }),
      expect.any(AbortSignal),
    )
    view.rerender(<SpreadsheetPreviewSurface path="/data.csv" title="data.csv" source="1,2" />)
    await screen.findByRole('grid')
    expect(
      screen.queryByRole('button', { name: 'preview.spreadsheetCalculate' }),
    ).not.toBeInTheDocument()
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ recalculate: true }),
      expect.any(AbortSignal),
    )
  })

  it('keeps saved values accessible after native calculation fails', async () => {
    vi.mocked(spreadsheetApi.readPage)
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new Error('Unsupported formula'))
      .mockResolvedValueOnce(page)
    renderPreview()
    await screen.findByRole('grid')
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetCalculate' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported formula')
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetSavedValues' }))
    expect(await screen.findByRole('grid')).toHaveTextContent('header|value')
    expect(screen.getByRole('button', { name: 'preview.spreadsheetCalculate' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('defers offscreen embedded reads until the preview becomes visible', async () => {
    viewport.visible = false
    vi.mocked(spreadsheetApi.readPage).mockResolvedValue(page)
    const view = renderPreview({
      path: '/report.xlsx',
      title: 'report.xlsx',
      presentation: 'embedded',
    })
    expect(spreadsheetApi.readPage).not.toHaveBeenCalled()
    viewport.visible = true
    view.rerender(
      <SpreadsheetPreviewSurface path="/report.xlsx" title="report.xlsx" presentation="embedded" />,
    )
    expect(await screen.findByRole('grid')).toHaveTextContent('header|value')
  })

  beforeEach(() => {
    vi.resetAllMocks()
    viewport.visible = true
  })

  it('paginates real rows without treating the first row as headers and resets on sheet change', async () => {
    vi.mocked(spreadsheetApi.readPage).mockImplementation(async (request) => ({
      ...page,
      sheet: request.sheet ?? 'First',
      offset: request.offset ?? 0,
      rows: request.offset ? [['last', 'row']] : page.rows,
    }))
    renderPreview()
    expect(await screen.findByRole('grid')).toHaveTextContent('1: header|value')
    expect(screen.getByRole('button', { name: 'preview.spreadsheetPrevious' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetNext' }))
    await waitFor(() => expect(screen.getByRole('grid')).toHaveTextContent('201: last|row'))
    expect(screen.getByRole('button', { name: 'preview.spreadsheetNext' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Second' } })
    await waitFor(() => expect(screen.getByRole('grid')).toHaveTextContent('1: header|value'))
    expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
      expect.objectContaining({ sheet: 'Second', offset: 0, limit: 200 }),
      expect.any(AbortSignal),
    )
  })

  it('resets sheet and page when changing files and aborts abandoned reads', async () => {
    vi.mocked(spreadsheetApi.readPage).mockResolvedValue(page)
    const view = renderPreview({ path: '/report.csv', title: 'report.csv', source: 'old,data' })
    await screen.findByRole('grid')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Second' } })
    await waitFor(() =>
      expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ sheet: 'Second' }),
        expect.any(AbortSignal),
      ),
    )
    const oldSignal = vi.mocked(spreadsheetApi.readPage).mock.calls.at(-1)?.[1]
    vi.mocked(spreadsheetApi.readPage).mockImplementation(() => new Promise(() => undefined))
    view.rerender(<SpreadsheetPreviewSurface path="/new.csv" title="new.csv" source="new,data" />)
    await waitFor(() =>
      expect(spreadsheetApi.readPage).toHaveBeenLastCalledWith(
        expect.objectContaining({
          path: '/new.csv',
          source: 'new,data',
          sheet: undefined,
          offset: 0,
        }),
        expect.any(AbortSignal),
      ),
    )
    const pendingSignal = vi.mocked(spreadsheetApi.readPage).mock.calls.at(-1)?.[1]
    expect(oldSignal).toBeDefined()
    expect(screen.getByRole('status', { name: 'preview.spreadsheetLoading' })).toHaveTextContent(
      'preview.spreadsheetLoading',
    )
    view.unmount()
    expect(pendingSignal?.aborted).toBe(true)
  })

  it('shows failures with retry and handles empty truncated sheets explicitly', async () => {
    vi.mocked(spreadsheetApi.readPage)
      .mockRejectedValueOnce(new Error('Bad workbook'))
      .mockResolvedValueOnce({ ...page, rows: [], cells: [], totalRows: 0, truncated: true })
    renderPreview()
    expect(await screen.findByRole('alert')).toHaveTextContent('Bad workbook')
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetRetry' }))
    expect(await screen.findByText('preview.spreadsheetEmpty')).toBeInTheDocument()
    expect(screen.getByText('preview.spreadsheetTruncated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'preview.spreadsheetNext' })).toBeDisabled()
  })
})
