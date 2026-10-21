import { fireEvent, render, screen } from '@testing-library/react'
import type { TElement } from 'platejs'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TableCellResizable } from '@/components/plate/nodes/TableCellResizable'

const mocks = vi.hoisted(() => ({
  readOnly: false,
  resize: {
    hiddenLeft: true,
    leftProps: { options: { direction: 'left' } },
    rightProps: { options: { direction: 'right', onResize: vi.fn() } },
  },
  state: {
    colIndex: 1,
    colSpan: 1,
    minHeight: 34,
    rowIndex: 0,
    selected: false,
    width: 160,
  },
}))

vi.mock('@platejs/table/react', () => ({
  useTableCellElement: () => mocks.state,
  useTableCellElementResizable: () => mocks.resize,
}))
vi.mock('@platejs/resizable', () => ({
  ResizeHandle: (props: Record<string, unknown>) => <span {...props} />,
}))
vi.mock('platejs/react', () => ({
  PlateElement: ({ as: Tag, attributes, children, ...props }: Record<string, unknown>) => {
    const Component = Tag as 'td'
    return (
      <Component {...((attributes ?? {}) as Record<string, unknown>)} {...props}>
        {children as ReactNode}
      </Component>
    )
  },
  useEditorRef: () => ({}),
  useElementSelector: () => ({ children: [], type: 'table' }),
  useReadOnly: () => mocks.readOnly,
}))
vi.mock('@/components/plate/nodes/TableGutterControls', () => ({
  TableGutterControls: () => <span data-testid="gutter-controls" />,
}))
vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string, values: { index: number }) => `${key}:${values.index}` }),
}))

describe('TableCellResizable', () => {
  it('uses Plate column sizing and renders an accessible resize handle', () => {
    const element = { children: [], id: 'cell-2', type: 'th' } as TElement
    const cellProps = {
      attributes: {},
      children: 'Heading',
      element,
    } as unknown as ComponentProps<typeof TableCellResizable>
    render(
      <table>
        <tbody>
          <tr>
            <TableCellResizable {...cellProps} />
          </tr>
        </tbody>
      </table>,
    )

    const cell = screen.getByRole('columnheader')
    expect(cell).toHaveStyle({ minHeight: '34px', width: '160px' })
    expect(cell).toHaveAttribute('data-table-cell-id', 'cell-2')
    expect(
      screen.getByRole('separator', { name: 'editor.tableResizeColumn:2' }),
    ).toBeInTheDocument()
    expect(screen.getByTestId('gutter-controls')).toBeInTheDocument()
  })

  it('supports keyboard column resizing with range metadata', () => {
    const onResize = vi.fn()
    mocks.resize.rightProps = {
      options: { direction: 'right', onResize },
    }
    const element = { children: [], id: 'cell-2', type: 'td' } as TElement
    const cellProps = {
      attributes: {},
      children: 'Cell',
      element,
    } as unknown as ComponentProps<typeof TableCellResizable>
    render(
      <table>
        <tbody>
          <tr>
            <TableCellResizable {...cellProps} />
          </tr>
        </tbody>
      </table>,
    )

    const handle = screen.getByRole('separator', { name: 'editor.tableResizeColumn:2' })
    expect(handle).toHaveAttribute('aria-valuemin', '96')
    expect(handle).toHaveAttribute('aria-valuemax', '4096')
    expect(handle).toHaveAttribute('aria-valuenow', '160')

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'ArrowLeft', shiftKey: true })

    expect(onResize).toHaveBeenNthCalledWith(1, {
      delta: 16,
      direction: 'right',
      finished: true,
      initialSize: 160,
    })
    expect(onResize).toHaveBeenNthCalledWith(2, {
      delta: -64,
      direction: 'right',
      finished: true,
      initialSize: 160,
    })
  })

  it('resizes an automatic column from its rendered width without collapsing it', () => {
    mocks.state.width = 0
    const onResize = vi.fn()
    mocks.resize.rightProps = { options: { direction: 'right', onResize } }
    const cellProps = {
      attributes: {},
      children: 'Cell',
      element: { children: [], type: 'td' },
    } as unknown as ComponentProps<typeof TableCellResizable>
    render(
      <table>
        <tbody>
          <tr>
            <TableCellResizable {...cellProps} />
          </tr>
        </tbody>
      </table>,
    )
    const cell = screen.getByRole('cell')
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({ width: 320 } as DOMRect)
    const handle = screen.getByRole('separator')
    expect(handle).not.toHaveAttribute('aria-valuenow')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenCalledWith({
      delta: 16,
      direction: 'right',
      finished: true,
      initialSize: 320,
    })
    mocks.state.width = 160
  })
})
