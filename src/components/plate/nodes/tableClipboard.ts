import Papa from 'papaparse'
import type { TElement } from 'platejs'
import type { PlateEditor } from 'platejs/react'

const MAX_TABLE_COLUMNS = 50
const MAX_TABLE_ROWS = 500
const MAX_TABLE_CELLS = 10_000
const DISABLED_TYPES = new Set(['code_block', 'codeBlock', 'frontmatter', 'front_matter', 'yaml'])

const normalizeCell = (value: unknown) =>
  String(value ?? '')
    .replace(/\r?\n/gu, ' ')
    .trim()

export const parseDelimitedTableText = (text: string): string[][] | null => {
  const source = text.trim()
  const hasTabDelimiter = source.includes('\t')
  const hasCsvRows = source.includes(',') && /\r?\n/u.test(source)
  if (!source || (!hasTabDelimiter && !hasCsvRows)) return null

  const parsed = Papa.parse<string[]>(source, {
    delimiter: hasTabDelimiter ? '\t' : ',',
    skipEmptyLines: 'greedy',
  })
  const rows = parsed.data.map((row) => row.map(normalizeCell))
  const columnCount = rows[0]?.length ?? 0
  const hasStableColumns = rows.every((row) => row.length === columnCount)
  if (
    parsed.errors.length > 0 ||
    columnCount < 2 ||
    columnCount > MAX_TABLE_COLUMNS ||
    !hasStableColumns ||
    rows.length === 0 ||
    rows.length > MAX_TABLE_ROWS ||
    columnCount * rows.length > MAX_TABLE_CELLS
  ) {
    return null
  }

  return rows
}

const createCell = (text: string, header: boolean): TElement => ({
  children: [{ children: [{ text }], type: 'p' }],
  type: header ? 'th' : 'td',
})

export const createDelimitedTableNode = (rows: string[][]): TElement => ({
  children: rows.map((row, rowIndex) => ({
    children: row.map((text) => createCell(text, rowIndex === 0)),
    type: 'tr',
  })),
  type: 'table',
})

const isPasteDisabledAtSelection = (editor: PlateEditor) => {
  const path = editor.selection?.focus.path
  if (!path) return true
  for (let depth = 1; depth < path.length; depth += 1) {
    const entry = editor.api.node(path.slice(0, depth))
    const type = entry?.[0] && 'type' in entry[0] ? entry[0].type : null
    if (typeof type === 'string' && DISABLED_TYPES.has(type)) return true
  }
  return false
}

export const handleDelimitedTablePaste = (editor: PlateEditor, event: ClipboardEvent) => {
  if (!event.clipboardData || isPasteDisabledAtSelection(editor)) return false
  if (event.clipboardData.getData('text/html').trim()) return false
  const text = event.clipboardData.getData('text/plain')
  const rows = parseDelimitedTableText(text)
  if (!rows) {
    if (!text.includes(',') && !text.includes('\t')) return false
    event.preventDefault()
    editor.tf.insertText(text)
    return true
  }

  event.preventDefault()
  editor.tf.insertNodes(createDelimitedTableNode(rows))
  return true
}
