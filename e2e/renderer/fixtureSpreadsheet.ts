import fs from 'node:fs/promises'
import { read, utils } from 'xlsx'
import type { SpreadsheetPage } from '@/services/spreadsheetApi'

// Only the native command boundary is substituted. Real XLSX bytes are used by
// the browser scenario; Rust parsing is covered by the backend's own tests.
export const readFixtureSpreadsheet = async (
  request: Record<string, unknown>,
  target: (relative: string) => string,
  readAsset: (url: string) => Promise<Buffer>,
): Promise<SpreadsheetPage> => {
  if (typeof request.path !== 'string') throw new Error('Missing fixture workbook path')
  const file = target(request.path)
  const bytes =
    typeof request.assetUrl === 'string'
      ? await readAsset(request.assetUrl)
      : await fs.readFile(file)
  if (bytes.byteLength > 1024 * 1024) throw new Error('Fixture workbook exceeds its bound')
  const workbook = read(bytes, { type: 'buffer' })
  const sheet = typeof request.sheet === 'string' ? request.sheet : workbook.SheetNames[0]
  const worksheet = workbook.Sheets[sheet]
  if (!worksheet) throw new Error('Unknown fixture sheet')
  const rows = utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  })
  const offset = typeof request.offset === 'number' ? request.offset : 0
  const limit = typeof request.limit === 'number' ? request.limit : 200
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1)
    throw new Error('Invalid fixture spreadsheet page')
  const visible = rows.slice(offset, offset + Math.min(limit, 500))
  return {
    sheets: workbook.SheetNames,
    sheet,
    columns: Math.min(256, utils.decode_range(worksheet['!ref'] ?? 'A1').e.c + 1),
    totalRows: rows.length,
    offset,
    rows: visible.map((row) => row.map((value) => String(value ?? ''))),
    cells: visible.map((row) => row.map((value) => ({ value: String(value ?? '') }))),
    truncated: false,
    calculation: { status: 'cached', warnings: [], errorCount: 0 },
  }
}
