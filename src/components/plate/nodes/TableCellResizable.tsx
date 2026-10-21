import { ResizeHandle } from '@platejs/resizable'
import { useTableCellElement, useTableCellElementResizable } from '@platejs/table/react'
import { KEYS, type TElement } from 'platejs'
import { useRef, type KeyboardEventHandler } from 'react'
import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElementSelector,
  useReadOnly,
} from 'platejs/react'
import { TableGutterControls } from '@/components/plate/nodes/TableGutterControls'
import { createTableOperations } from '@/components/plate/nodes/tableOperations'
import { useI18n } from '@/i18n/useI18n'

type TableCellNode = TElement & {
  align?: 'left' | 'center' | 'right'
  colSpan?: number
  rowSpan?: number
}

type TableCellResizableProps = PlateElementProps<TableCellNode>

const cellAlignmentClass = {
  center: 'text-center',
  left: 'text-left',
  right: 'text-right',
} as const

const TABLE_COLUMN_KEYBOARD_STEP = 16
const TABLE_COLUMN_MAX_WIDTH = 4096
const TABLE_COLUMN_MIN_WIDTH = 96

export const TableCellResizable = (props: TableCellResizableProps) => {
  const editor = useEditorRef()
  const cellRef = useRef<HTMLTableCellElement>(null)
  const readOnly = useReadOnly()
  const { t } = useI18n()
  const { colIndex, colSpan, minHeight, rowIndex, selected, width } = useTableCellElement()
  const { rightProps } = useTableCellElementResizable({ colIndex, colSpan, rowIndex })
  const table = useElementSelector(([node]) => node, [], { key: KEYS.table }) as TElement
  const header = props.element.type === 'th'
  const operations = createTableOperations(editor, table)
  const parsedWidth = typeof width === 'number' ? width : Number.parseFloat(width)
  const currentWidth = parsedWidth > 0 ? parsedWidth : TABLE_COLUMN_MIN_WIDTH
  const handleResizeKeyDown: KeyboardEventHandler<HTMLElement> = (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const multiplier = event.shiftKey ? 4 : 1
    rightProps.options?.onResize?.({
      delta: direction * TABLE_COLUMN_KEYBOARD_STEP * multiplier,
      direction: 'right',
      finished: true,
      initialSize: cellRef.current?.getBoundingClientRect().width || currentWidth,
    })
  }
  const attributes = {
    ...props.attributes,
    colSpan: props.element.colSpan,
    'data-table-cell-id': typeof props.element.id === 'string' ? props.element.id : undefined,
    'data-table-cell-selected': selected ? 'true' : undefined,
    rowSpan: props.element.rowSpan,
  } as typeof props.attributes

  return (
    <PlateElement
      {...props}
      as={header ? 'th' : 'td'}
      attributes={attributes}
      className={`group/table-cell relative min-w-24 border-b border-r border-border px-3 py-2 align-top last:border-r-0 ${
        header ? 'bg-muted/60 font-semibold first:rounded-tl-lg last:rounded-tr-lg' : ''
      } ${cellAlignmentClass[props.element.align ?? 'left']}`}
      ref={cellRef}
      style={{ minHeight, width: parsedWidth > 0 ? width : undefined }}
    >
      {readOnly ? null : (
        <>
          <TableGutterControls columnIndex={colIndex} operations={operations} rowIndex={rowIndex} />
          <ResizeHandle
            {...rightProps}
            aria-label={t('editor.tableResizeColumn', { index: colIndex + 1 })}
            aria-orientation="vertical"
            aria-valuemax={TABLE_COLUMN_MAX_WIDTH}
            aria-valuemin={TABLE_COLUMN_MIN_WIDTH}
            aria-valuenow={parsedWidth > 0 ? Math.round(currentWidth) : undefined}
            className="absolute inset-y-0 -right-1 z-30 w-2 cursor-col-resize touch-none opacity-0 transition-opacity hover:bg-primary/30 group-hover/table-cell:opacity-100 focus-visible:bg-primary/30 focus-visible:opacity-100"
            contentEditable={false}
            onKeyDown={handleResizeKeyDown}
            role="separator"
            tabIndex={0}
          />
        </>
      )}
      {props.children}
    </PlateElement>
  )
}
