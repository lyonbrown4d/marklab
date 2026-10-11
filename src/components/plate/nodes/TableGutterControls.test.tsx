import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TableGutterControls } from '@/components/plate/nodes/TableGutterControls'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values?: { index?: number }) => `${key}:${values?.index}` }),
}))

const createOperations = () => ({
  moveColumn: vi.fn(),
  moveRow: vi.fn(),
  selectColumn: vi.fn(),
  selectRow: vi.fn(),
  supportsGridOperations: true,
})

describe('TableGutterControls', () => {
  it('selects a row and moves it with Alt+Arrow keys', async () => {
    const user = userEvent.setup()
    const operations = createOperations()
    render(<TableGutterControls columnIndex={0} operations={operations} rowIndex={1} />)

    const rowHandle = screen.getByRole('button', { name: 'editor.tableSelectRow:2' })
    await user.click(rowHandle)
    rowHandle.focus()
    await user.keyboard('{Alt>}{ArrowUp}{/Alt}')
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}')

    expect(operations.selectRow).toHaveBeenCalledWith(1)
    expect(operations.moveRow).toHaveBeenNthCalledWith(1, 'up', 1)
    expect(operations.moveRow).toHaveBeenNthCalledWith(2, 'down', 1)
  })

  it('selects a column and moves it with Alt+Arrow keys', async () => {
    const user = userEvent.setup()
    const operations = createOperations()
    render(<TableGutterControls columnIndex={1} operations={operations} rowIndex={0} />)

    const columnHandle = screen.getByRole('button', { name: 'editor.tableSelectColumn:2' })
    await user.click(columnHandle)
    columnHandle.focus()
    await user.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    await user.keyboard('{Alt>}{ArrowRight}{/Alt}')

    expect(operations.selectColumn).toHaveBeenCalledWith(1)
    expect(operations.moveColumn).toHaveBeenNthCalledWith(1, 'left', 1)
    expect(operations.moveColumn).toHaveBeenNthCalledWith(2, 'right', 1)
  })

  it('only renders row controls in the first column and column controls in the first row', () => {
    const operations = createOperations()
    const { rerender } = render(
      <TableGutterControls columnIndex={2} operations={operations} rowIndex={2} />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(<TableGutterControls columnIndex={0} operations={operations} rowIndex={0} />)
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('disables handles when merged cells make grid indexes ambiguous', () => {
    const operations = { ...createOperations(), supportsGridOperations: false }
    render(<TableGutterControls columnIndex={0} operations={operations} rowIndex={0} />)

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
})
