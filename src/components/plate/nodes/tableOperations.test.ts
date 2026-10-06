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
})

describe('isImeCompositionEvent', () => {
  it('recognizes native composition state and the IME Process key', () => {
    expect(isImeCompositionEvent({ isComposing: true, key: 'Enter' })).toBe(true)
    expect(isImeCompositionEvent({ isComposing: false, key: 'Process' })).toBe(true)
    expect(isImeCompositionEvent({ isComposing: false, key: 'Enter' })).toBe(false)
  })
})
