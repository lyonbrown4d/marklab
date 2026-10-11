import { deleteColumn, deleteRow, insertTableColumn, insertTableRow } from '@platejs/table'
import type { Path, SlateEditor, TElement } from 'platejs'
import { isImeKeyboardEvent } from '@/logic/ime'

export type TableAlignment = 'left' | 'center' | 'right'
export type TableMoveDirection = 'down' | 'left' | 'right' | 'up'

type TableTransforms = {
  deleteColumn: typeof deleteColumn
  deleteRow: typeof deleteRow
  insertColumn: typeof insertTableColumn
  insertRow: typeof insertTableRow
}

const defaultTransforms: TableTransforms = {
  deleteColumn,
  deleteRow,
  insertColumn: insertTableColumn,
  insertRow: insertTableRow,
}

export const createTableOperations = (
  editor: SlateEditor,
  table: TElement,
  transforms: TableTransforms = defaultTransforms,
) => {
  const getTablePath = () => editor.api.findPath(table)
  const selectionBelongsToTable = (tablePath: Path) => {
    const selectionPath = editor.selection?.anchor.path
    return Boolean(selectionPath && tablePath.every((part, index) => selectionPath[index] === part))
  }
  const activateTable = () => {
    const tablePath = getTablePath()
    if (!tablePath) return false
    if (!selectionBelongsToTable(tablePath)) editor.tf.select(editor.api.start(tablePath))
    return true
  }
  const runForTable = (operation: (targetEditor: SlateEditor) => void) => {
    if (activateTable()) operation(editor)
  }
  const getGridSize = () => ({
    columns: (table.children[0] as TElement | undefined)?.children.length ?? 0,
    rows: table.children.length,
  })
  const currentCellIndices = () => {
    const tablePath = getTablePath()
    const path = editor.selection?.anchor.path
    if (!tablePath || !path || !selectionBelongsToTable(tablePath)) return null
    return {
      column: path[tablePath.length + 1],
      row: path[tablePath.length],
      tablePath,
    }
  }
  const selectGridRange = (startPath: Path, endPath: Path) => {
    const anchor = editor.api.start(startPath)
    const focus = editor.api.end(endPath)
    if (!anchor || !focus) return false
    editor.tf.select({
      anchor,
      focus,
    })
    return true
  }
  const moveRow = (direction: Extract<TableMoveDirection, 'down' | 'up'>, index?: number) => {
    const tablePath = getTablePath()
    const row = index ?? currentCellIndices()?.row
    const { rows } = getGridSize()
    if (!tablePath || row === undefined) return false
    const target = direction === 'up' ? row - 1 : row + 1
    if (target < 0 || target >= rows) return false
    const firstRow = table.children[0] as TElement | undefined
    const hasHeader = firstRow?.children.some((cell) => 'type' in cell && cell.type === 'th')
    if (hasHeader && (row === 0 || target === 0)) return false
    editor.tf.moveNodes({
      at: [...tablePath, row],
      to: [...tablePath, direction === 'up' ? target : target + 1],
    })
    return true
  }
  const moveColumn = (direction: Extract<TableMoveDirection, 'left' | 'right'>, index?: number) => {
    const tablePath = getTablePath()
    const column = index ?? currentCellIndices()?.column
    const { columns, rows } = getGridSize()
    if (!tablePath || column === undefined) return false
    const target = direction === 'left' ? column - 1 : column + 1
    if (target < 0 || target >= columns) return false
    editor.tf.withNewBatch(() => {
      editor.tf.withoutNormalizing(() => {
        for (let row = 0; row < rows; row += 1) {
          editor.tf.moveNodes({
            at: [...tablePath, row, column],
            to: [...tablePath, row, direction === 'left' ? target : target + 1],
          })
        }
      })
    })
    return true
  }

  return {
    addColumn: () => runForTable(transforms.insertColumn),
    addRow: () => runForTable(transforms.insertRow),
    align: (align: TableAlignment) => {
      const tablePath = getTablePath()
      if (!tablePath || !activateTable()) return
      const selectionPath = editor.selection?.anchor.path
      const columnIndex = selectionPath?.[tablePath.length + 1]
      if (columnIndex === undefined) return
      table.children.forEach((row, rowIndex) => {
        const rowElement = row as TElement
        if (!rowElement.children[columnIndex]) return
        editor.tf.setNodes({ align }, { at: [...tablePath, rowIndex, columnIndex] })
      })
    },
    moveColumn,
    moveRow,
    removeColumn: () => runForTable(transforms.deleteColumn),
    removeRow: () => runForTable(transforms.deleteRow),
    selectColumn: (columnIndex: number) => {
      const tablePath = getTablePath()
      const { columns, rows } = getGridSize()
      if (!tablePath || columnIndex < 0 || columnIndex >= columns || rows === 0) return false
      return selectGridRange([...tablePath, 0, columnIndex], [...tablePath, rows - 1, columnIndex])
    },
    selectRow: (rowIndex: number) => {
      const tablePath = getTablePath()
      const { columns, rows } = getGridSize()
      if (!tablePath || rowIndex < 0 || rowIndex >= rows || columns === 0) return false
      return selectGridRange([...tablePath, rowIndex, 0], [...tablePath, rowIndex, columns - 1])
    },
  }
}

type CompositionKeyboardEvent = {
  isComposing: boolean
  key: string
}

export const isImeCompositionEvent = (event: CompositionKeyboardEvent) => isImeKeyboardEvent(event)
