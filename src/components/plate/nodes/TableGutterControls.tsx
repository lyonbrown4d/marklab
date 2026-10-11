import { GripHorizontal, GripVertical } from 'lucide-react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { Button } from '@/components/ui/button'
import type { TableMoveDirection } from '@/components/plate/nodes/tableOperations'
import { useI18n } from '@/i18n/useI18n'

export type TableGutterOperations = {
  moveColumn: (direction: Extract<TableMoveDirection, 'left' | 'right'>, index?: number) => boolean
  moveRow: (direction: Extract<TableMoveDirection, 'down' | 'up'>, index?: number) => boolean
  selectColumn: (index: number) => boolean
  selectRow: (index: number) => boolean
}

type TableGutterControlsProps = {
  columnIndex: number
  operations: TableGutterOperations
  rowIndex: number
}

const stopEditorPointerSelection = (event: PointerEvent<HTMLButtonElement>) => {
  event.preventDefault()
  event.stopPropagation()
}

const handleMoveKey = (
  event: KeyboardEvent<HTMLButtonElement>,
  move: (direction: TableMoveDirection) => void,
) => {
  if (!event.altKey) return
  const directionByKey = {
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
  } as const
  const direction = directionByKey[event.key as keyof typeof directionByKey]
  if (!direction) return
  event.preventDefault()
  event.stopPropagation()
  move(direction)
}

export const TableGutterControls = ({
  columnIndex,
  operations,
  rowIndex,
}: TableGutterControlsProps) => {
  const { t } = useI18n()

  return (
    <>
      {columnIndex === 0 ? (
        <Button
          aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
          aria-label={t('editor.tableSelectRow', { index: rowIndex + 1 })}
          className="absolute top-1/2 -left-5 z-20 size-5 -translate-y-1/2 opacity-0 transition-opacity group-hover/table-cell:opacity-100 focus:opacity-100"
          contentEditable={false}
          onClick={() => operations.selectRow(rowIndex)}
          onKeyDown={(event) =>
            handleMoveKey(event, (direction) => {
              if (direction === 'up' || direction === 'down') {
                operations.moveRow(direction, rowIndex)
              }
            })
          }
          onPointerDown={stopEditorPointerSelection}
          size="icon"
          type="button"
          variant="ghost"
        >
          <GripVertical aria-hidden="true" className="size-3" />
        </Button>
      ) : null}
      {rowIndex === 0 ? (
        <Button
          aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
          aria-label={t('editor.tableSelectColumn', { index: columnIndex + 1 })}
          className="absolute -top-5 left-1/2 z-20 size-5 -translate-x-1/2 opacity-0 transition-opacity group-hover/table-cell:opacity-100 focus:opacity-100"
          contentEditable={false}
          onClick={() => operations.selectColumn(columnIndex)}
          onKeyDown={(event) =>
            handleMoveKey(event, (direction) => {
              if (direction === 'left' || direction === 'right') {
                operations.moveColumn(direction, columnIndex)
              }
            })
          }
          onPointerDown={stopEditorPointerSelection}
          size="icon"
          type="button"
          variant="ghost"
        >
          <GripHorizontal aria-hidden="true" className="size-3" />
        </Button>
      ) : null}
    </>
  )
}
