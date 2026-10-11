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
const DEFAULT_COLUMN_WIDTH = 160

const TableElementBase = (props: PlateElementProps<TableElementNode>) => {
  const tableRef = useRef<HTMLTableElement>(null)
  const { marginLeft, props: tableProps } = useTableElement()
  const configuredColSizes = useTableColSizes()
  const columnCount = (props.element.children[0] as TElement | undefined)?.children.length ?? 0
  const colSizes = Array.from(
    { length: columnCount },
    (_, index) => configuredColSizes[index] || DEFAULT_COLUMN_WIDTH,
  )
  useTableSelectionDom(tableRef)

  return (
    <PlateElement {...props} className="overflow-x-auto py-5">
      <table
        {...tableProps}
        ref={tableRef}
        className="table-fixed border-collapse overflow-hidden rounded-lg border border-border"
        data-slate-node="element"
        style={{ marginLeft, width: colSizes.reduce((total, size) => total + size, 0) }}
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
    <div className="my-5 overflow-x-auto">
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
