import type { SlateEditor, TElement } from 'platejs'
import { describe, expect, it, vi } from 'vitest'
import {
  createTableOperations,
  isImeCompositionEvent,
} from '@/components/plate/nodes/tableOperations'

describe('createTableOperations', () => {
  const table = { children: [], type: 'table' } as TElement

  it('delegates structural changes to Plate table transforms', () => {
    const transforms = {
      deleteColumn: vi.fn(),
      deleteRow: vi.fn(),
      insertColumn: vi.fn(),
      insertRow: vi.fn(),
    }
    const point = { offset: 0, path: [2, 0, 0, 0] }
    const editor = {
      api: { findPath: vi.fn(() => [2]), start: vi.fn(() => point) },
      selection: {
        anchor: { offset: 0, path: [0, 0] },
        focus: { offset: 0, path: [0, 0] },
      },
      tf: {
        select: vi.fn((nextPoint) => {
          editor.selection = { anchor: nextPoint, focus: nextPoint }
        }),
      },
    } as unknown as SlateEditor
    const operations = createTableOperations(editor, table, transforms)

    operations.addRow()
    operations.addColumn()
    operations.removeRow()
    operations.removeColumn()

    expect(transforms.insertRow).toHaveBeenCalledWith(editor)
    expect(transforms.insertColumn).toHaveBeenCalledWith(editor)
    expect(transforms.deleteRow).toHaveBeenCalledWith(editor)
    expect(transforms.deleteColumn).toHaveBeenCalledWith(editor)
    expect(editor.api.findPath).toHaveBeenCalledWith(table)
    expect(editor.tf.select).toHaveBeenCalledWith(point)
  })

  it('updates alignment for the selected column across header and body rows', () => {
    const setNodes = vi.fn()
    const alignedTable = {
      children: [
        { children: [{ type: 'th' }, { type: 'th' }], type: 'tr' },
        { children: [{ type: 'td' }, { type: 'td' }], type: 'tr' },
        { children: [{ type: 'td' }], type: 'tr' },
      ],
      type: 'table',
    } as TElement
    const editor = {
      api: { findPath: vi.fn(() => [2]) },
      selection: {
        anchor: { offset: 0, path: [2, 1, 1, 0, 0] },
        focus: { offset: 0, path: [2, 1, 1, 0, 0] },
      },
      tf: { setNodes },
    } as unknown as SlateEditor
    const operations = createTableOperations(editor, alignedTable)

    operations.align('center')

    expect(setNodes.mock.calls).toEqual([
      [{ align: 'center' }, { at: [2, 0, 1] }],
      [{ align: 'center' }, { at: [2, 1, 1] }],
    ])
  })

  it('does not mutate another table when its table is no longer mounted', () => {
    const transforms = {
      deleteColumn: vi.fn(),
      deleteRow: vi.fn(),
      insertColumn: vi.fn(),
      insertRow: vi.fn(),
    }
    const editor = {
      api: { findPath: vi.fn(() => undefined) },
      tf: { setNodes: vi.fn() },
    } as unknown as SlateEditor
    const operations = createTableOperations(editor, table, transforms)

    operations.removeRow()
    operations.align('right')

    expect(transforms.deleteRow).not.toHaveBeenCalled()
    expect(editor.tf.setNodes).not.toHaveBeenCalled()
  })

  it('selects complete rows and columns for accessible gutter controls', () => {
    const tableWithGrid = {
      children: [
        { children: [{ type: 'th' }, { type: 'th' }], type: 'tr' },
        { children: [{ type: 'td' }, { type: 'td' }], type: 'tr' },
      ],
      type: 'table',
    } as TElement
    const select = vi.fn()
    const start = vi.fn((path) => ({ offset: 0, path: [...path, 0, 0] }))
    const end = vi.fn((path) => ({ offset: 1, path: [...path, 0, 0] }))
    const editor = {
      api: { end, findPath: vi.fn(() => [2]), start },
      selection: {
        anchor: { offset: 0, path: [2, 0, 0, 0, 0] },
        focus: { offset: 0, path: [2, 0, 0, 0, 0] },
      },
      tf: { select },
    } as unknown as SlateEditor
    const operations = createTableOperations(editor, tableWithGrid)

    operations.selectRow(1)
    operations.selectColumn(1)

    expect(select).toHaveBeenNthCalledWith(1, {
      anchor: start.mock.results[0].value,
      focus: end.mock.results[0].value,
    })
    expect(start).toHaveBeenNthCalledWith(1, [2, 1, 0])
    expect(end).toHaveBeenNthCalledWith(1, [2, 1, 1])
    expect(start).toHaveBeenNthCalledWith(2, [2, 0, 1])
    expect(end).toHaveBeenNthCalledWith(2, [2, 1, 1])
  })

  it('moves rows and columns with one undoable normalized transform', () => {
    const grid = {
      children: [
        { children: [{ type: 'th' }, { type: 'th' }], type: 'tr' },
        { children: [{ type: 'td' }, { type: 'td' }], type: 'tr' },
        { children: [{ type: 'td' }, { type: 'td' }], type: 'tr' },
      ],
      type: 'table',
    } as TElement
    const moveNodes = vi.fn()
    const withoutNormalizing = vi.fn((callback: () => void) => callback())
    const withNewBatch = vi.fn((callback: () => void) => callback())
    const editor = {
      api: { findPath: vi.fn(() => [2]) },
      selection: {
        anchor: { offset: 0, path: [2, 1, 0, 0, 0] },
        focus: { offset: 0, path: [2, 1, 0, 0, 0] },
      },
      tf: { moveNodes, withNewBatch, withoutNormalizing },
    } as unknown as SlateEditor
    const operations = createTableOperations(editor, grid)

    expect(operations.moveRow('down', 1)).toBe(true)
    expect(operations.moveColumn('right', 0)).toBe(true)

    expect(moveNodes).toHaveBeenNthCalledWith(1, { at: [2, 1], to: [2, 3] })
    expect(moveNodes).toHaveBeenNthCalledWith(2, { at: [2, 0, 0], to: [2, 0, 2] })
    expect(moveNodes).toHaveBeenNthCalledWith(3, { at: [2, 1, 0], to: [2, 1, 2] })
    expect(moveNodes).toHaveBeenNthCalledWith(4, { at: [2, 2, 0], to: [2, 2, 2] })
    expect(withNewBatch).toHaveBeenCalledOnce()
    expect(withoutNormalizing).toHaveBeenCalledOnce()
  })

  it('keeps a GFM header in row zero when moving rows', () => {
    const moveNodes = vi.fn()
    const grid = {
      children: [
        { children: [{ type: 'th' }, { type: 'th' }], type: 'tr' },
        { children: [{ type: 'td' }, { type: 'td' }], type: 'tr' },
        { children: [{ type: 'td' }, { type: 'td' }], type: 'tr' },
      ],
      type: 'table',
    } as TElement
    const editor = {
      api: { findPath: vi.fn(() => [2]) },
      tf: { moveNodes, withNewBatch: vi.fn((callback: () => void) => callback()) },
    } as unknown as SlateEditor
    const operations = createTableOperations(editor, grid)

    expect(operations.moveRow('down', 0)).toBe(false)
    expect(operations.moveRow('up', 1)).toBe(false)
    expect(operations.moveRow('up', 2)).toBe(true)
    expect(moveNodes).toHaveBeenCalledOnce()
    expect(moveNodes).toHaveBeenCalledWith({ at: [2, 2], to: [2, 1] })
  })

  it('does not move rows or columns beyond the table edge', () => {
    const moveNodes = vi.fn()
    const editor = {
      api: { findPath: vi.fn(() => [2]) },
      tf: { moveNodes, withoutNormalizing: vi.fn() },
    } as unknown as SlateEditor
    const grid = {
      children: [{ children: [{ type: 'td' }], type: 'tr' }],
      type: 'table',
    } as TElement
    const operations = createTableOperations(editor, grid)

    expect(operations.moveRow('up', 0)).toBe(false)
    expect(operations.moveColumn('right', 0)).toBe(false)
    expect(moveNodes).not.toHaveBeenCalled()
  })
})

describe('isImeCompositionEvent', () => {
  it('recognizes native composition state and the IME Process key', () => {
    expect(isImeCompositionEvent({ isComposing: true, key: 'Enter' })).toBe(true)
    expect(isImeCompositionEvent({ isComposing: false, key: 'Process' })).toBe(true)
    expect(isImeCompositionEvent({ isComposing: false, key: 'Enter' })).toBe(false)
  })
})
