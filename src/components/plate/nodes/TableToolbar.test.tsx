import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { SlateEditor, TElement } from 'platejs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TableToolbar } from '@/components/plate/nodes/TableToolbar'

const operations = {
  addColumn: vi.fn(),
  addRow: vi.fn(),
  align: vi.fn(),
  removeColumn: vi.fn(),
  removeRow: vi.fn(),
}
const editor = {} as SlateEditor

vi.mock('platejs/react', () => ({ useEditorRef: () => editor }))
vi.mock('@/components/plate/nodes/tableOperations', () => ({
  createTableOperations: vi.fn(() => operations),
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => `translated:${key}` }),
}))

describe('TableToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses translated accessible labels and delegates table actions', async () => {
    const user = userEvent.setup()
    const table = { children: [], type: 'table' } as TElement
    render(<TableToolbar table={table} />)

    expect(
      screen.getByRole('toolbar', { name: 'translated:editor.tableEditing' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'translated:editor.tableAddRow' }))
    await user.click(screen.getByRole('button', { name: 'translated:editor.tableDeleteColumn' }))

    expect(operations.addRow).toHaveBeenCalledOnce()
    expect(operations.removeColumn).toHaveBeenCalledOnce()
  })
})
