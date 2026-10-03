import { deleteColumn, deleteRow, insertTableColumn, insertTableRow } from '@platejs/table'
import type { Path, SlateEditor, TElement } from 'platejs'

export type TableAlignment = 'left' | 'center' | 'right'

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
    removeColumn: () => runForTable(transforms.deleteColumn),
    removeRow: () => runForTable(transforms.deleteRow),
  }
}

type CompositionKeyboardEvent = {
  isComposing: boolean
  which: number
}

export const isImeCompositionEvent = ({ isComposing, which }: CompositionKeyboardEvent) =>
  isComposing || which === 229
