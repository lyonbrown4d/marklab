import type { TElement } from 'platejs'
import { PlateElement, type PlateElementProps, useReadOnly } from 'platejs/react'
import { TableToolbar } from '@/components/plate/nodes/TableToolbar'

export type TableElementNode = TElement
type TableCellNode = TElement & {
  align?: 'left' | 'center' | 'right'
  colSpan?: number
  rowSpan?: number
}

const cellAlignmentClass = {
  center: 'text-center',
  left: 'text-left',
  right: 'text-right',
} as const

export const TableElement = (props: PlateElementProps<TableElementNode>) => {
  return (
    <PlateElement
      {...props}
      as="table"
      className="w-max min-w-full border-collapse overflow-hidden rounded-lg border border-border"
    >
      <tbody>{props.children}</tbody>
    </PlateElement>
  )
}

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

const cellProps = (element: TableCellNode) => ({
  className: `min-w-24 border-r border-border px-3 py-2 align-top last:border-r-0 ${
    cellAlignmentClass[element.align ?? 'left']
  }`,
  colSpan: element.colSpan,
  rowSpan: element.rowSpan,
})

export const TableCellElement = (props: PlateElementProps<TableCellNode>) => (
  <PlateElement {...props} {...cellProps(props.element)} as="td" />
)

export const TableHeaderCellElement = (props: PlateElementProps<TableCellNode>) => (
  <PlateElement
    {...props}
    {...cellProps(props.element)}
    as="th"
    className={`${cellProps(props.element).className} bg-muted/60 font-semibold`}
  />
)
