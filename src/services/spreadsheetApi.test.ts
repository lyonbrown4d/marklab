import { beforeEach, describe, expect, it, vi } from 'vitest'
import { spreadsheetApi } from '@/services/spreadsheetApi'
import { invoke } from '@/runtime/ipc'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))
const page = {
  sheets: ['Sheet1'],
  sheet: 'Sheet1',
  columns: 2,
  totalRows: 1,
  offset: 0,
  rows: [['=SUM(A1)', '你好']],
  truncated: false,
}

describe('spreadsheetApi', () => {
  it('validates formula metadata and passes explicit native recalculation mode', async () => {
    const enriched = {
      ...page,
      cells: [[{ value: 0.25, formula: '1/4', format: '0%' }]],
      calculation: { status: 'recalculated', warnings: ['Unsupported function in B1'] },
    }
    vi.mocked(invoke).mockResolvedValueOnce(enriched)
    expect(
      await spreadsheetApi.readPage(
        { path: '/data.xlsx', recalculate: true },
        new AbortController().signal,
      ),
    ).toEqual(enriched)
    expect(invoke).toHaveBeenCalledWith('spreadsheet_read_page', {
      path: '/data.xlsx',
      recalculate: true,
    })
    vi.mocked(invoke).mockResolvedValueOnce({
      ...enriched,
      cells: [[{ value: { html: 'unsafe' }, formula: '1/4' }]],
    })
    await expect(
      spreadsheetApi.readPage({ path: '/bad.xlsx' }, new AbortController().signal),
    ).rejects.toThrow()
  })

  beforeEach(() => vi.resetAllMocks())

  it('passes source, sheet and page boundaries intact and validates cells as strings', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(page)
    expect(
      await spreadsheetApi.readPage(
        { path: '/data.csv', source: 'a,b', sheet: 'Sheet1', offset: 0, limit: 200 },
        new AbortController().signal,
      ),
    ).toEqual(page)
    expect(invoke).toHaveBeenCalledWith('spreadsheet_read_page', {
      path: '/data.csv',
      source: 'a,b',
      sheet: 'Sheet1',
      offset: 0,
      limit: 200,
    })
    vi.mocked(invoke).mockResolvedValueOnce({ ...page, rows: [[42]] })
    await expect(
      spreadsheetApi.readPage({ path: '/bad.xlsx' }, new AbortController().signal),
    ).rejects.toThrow()
  })

  it('normalizes Windows asset capabilities for the native reader', async () => {
    vi.mocked(invoke).mockResolvedValueOnce(page)
    const token = 'a'.repeat(43)
    await spreadsheetApi.readPage(
      { path: '/data.xlsx', assetUrl: `http://marklab-asset.localhost/local/v1/${token}#ignored` },
      new AbortController().signal,
    )
    expect(invoke).toHaveBeenCalledWith('spreadsheet_read_page', {
      path: '/data.xlsx',
      assetUrl: `marklab-asset://local/v1/${token}`,
    })
  })

  it('ignores late cancelled results and does not submit an already cancelled request', async () => {
    const controller = new AbortController()
    let complete: (value: unknown) => void = () => undefined
    vi.mocked(invoke).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        }),
    )
    const pending = spreadsheetApi.readPage({ path: '/data.csv' }, controller.signal)
    controller.abort()
    complete(page)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    vi.mocked(invoke).mockClear()
    await expect(
      spreadsheetApi.readPage({ path: '/data.csv' }, AbortSignal.abort()),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoke).not.toHaveBeenCalled()
  })

  it('surfaces native parsing failures', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('Workbook is corrupt'))
    await expect(
      spreadsheetApi.readPage({ path: '/bad.xlsx' }, new AbortController().signal),
    ).rejects.toThrow('Workbook is corrupt')
  })
})
