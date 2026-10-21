import {
  TableProvider,
  useTableColSizes,
  useTableElement,
  useTableSelectionDom,
} from '@platejs/table/react'
import type { TElement } from 'platejs'
import { useRef } from 'react'
import { PlateElement, type PlateElementProps, useReadOnly, withHOC } from 'platejs/react'
import { TableCellResizable } from '@/components/plate/nodes/TableCellResizable'
import { TableToolbar } from '@/components/plate/nodes/TableToolbar'

export type TableElementNode = TElement
const MIN_COLUMN_WIDTH = 96
const TABLE_BORDER_WIDTH = 2

const TableElementBase = (props: PlateElementProps<TableElementNode>) => {
  const tableRef = useRef<HTMLTableElement>(null)
  const { marginLeft, props: tableProps } = useTableElement()
  const configuredColSizes = useTableColSizes()
  const columnCount = (props.element.children[0] as TElement | undefined)?.children.length ?? 0
  const colSizes = Array.from(
    { length: columnCount },
    (_, index) => configuredColSizes[index] || undefined,
  )
  const sizedWidth = colSizes.every((size) => size !== undefined)
    ? colSizes.reduce<number>((total, size) => total + (size ?? 0), 0)
    : undefined
  const minWidth = colSizes.reduce<number>(
    (total, size) => total + (size ?? MIN_COLUMN_WIDTH),
    TABLE_BORDER_WIDTH,
  )
  useTableSelectionDom(tableRef)

  return (
    <PlateElement {...props} className="overflow-x-auto p-5">
      <table
        {...tableProps}
        ref={tableRef}
        className="w-full table-fixed border-separate border-spacing-0 rounded-lg border border-border bg-card [&_tr:last-child>*]:border-b-0"
        data-slate-node="element"
        style={{ marginLeft, minWidth, width: sizedWidth }}
      >
        <colgroup>
          {colSizes.map((size, index) => (
            <col key={index} style={{ width: size }} />
          ))}
        </colgroup>
        <tbody>{props.children}</tbody>
      </table>
    </PlateElement>
  )
}

export const TableElement = withHOC(TableProvider, TableElementBase)

export const TableContainer = ({ children, element }: PlateElementProps) => {
  const readOnly = useReadOnly()
  const table = element as TableElementNode
  return (
    <div className="my-4 min-w-0">
      {readOnly ? null : <TableToolbar table={table} />}
      {children}
    </div>
  )
}

export const TableRowElement = (props: PlateElementProps) => (
  <PlateElement {...props} as="tr" className="border-b border-border last:border-b-0" />
)

export const TableCellElement = TableCellResizable

export const TableHeaderCellElement = TableCellResizable
