import { describe, expect, it, vi } from 'vitest'
import {
  createDelimitedTableNode,
  handleDelimitedTablePaste,
  parseDelimitedTableText,
} from '@/components/plate/nodes/tableClipboard'

describe('parseDelimitedTableText', () => {
  it('parses TSV and quoted CSV into a rectangular grid', () => {
    expect(parseDelimitedTableText('Name\tRole\nAda\tEngineer')).toEqual([
      ['Name', 'Role'],
      ['Ada', 'Engineer'],
    ])
    expect(parseDelimitedTableText('"Doe, Jane",42\n"Smith, John",37')).toEqual([
      ['Doe, Jane', '42'],
      ['Smith, John', '37'],
    ])
  })

  it('does not treat prose or oversized grids as tables', () => {
    expect(parseDelimitedTableText('ordinary prose')).toBeNull()
    expect(parseDelimitedTableText('Hello, world')).toBeNull()
    expect(parseDelimitedTableText('A sentence, with a comma')).toBeNull()
    expect(parseDelimitedTableText('a\nb\nc')).toBeNull()
    expect(parseDelimitedTableText(`${'x\t'.repeat(51)}x`)).toBeNull()
  })

  it('requires multiline CSV with a stable column count while allowing one-line TSV', () => {
    expect(parseDelimitedTableText('Name,Role\nAda,Engineer')).toEqual([
      ['Name', 'Role'],
      ['Ada', 'Engineer'],
    ])
    expect(parseDelimitedTableText('Name,Role\nAda')).toBeNull()
    expect(parseDelimitedTableText('Name\tRole')).toEqual([['Name', 'Role']])
  })
})

describe('createDelimitedTableNode', () => {
  it('creates a GFM-compatible header and body table', () => {
    expect(
      createDelimitedTableNode([
        ['Name', 'Role'],
        ['Ada', 'Engineer'],
      ]),
    ).toEqual({
      children: [
        {
          children: [
            { children: [{ children: [{ text: 'Name' }], type: 'p' }], type: 'th' },
            { children: [{ children: [{ text: 'Role' }], type: 'p' }], type: 'th' },
          ],
          type: 'tr',
        },
        {
          children: [
            { children: [{ children: [{ text: 'Ada' }], type: 'p' }], type: 'td' },
            { children: [{ children: [{ text: 'Engineer' }], type: 'p' }], type: 'td' },
          ],
          type: 'tr',
        },
      ],
      type: 'table',
    })
  })
})

describe('handleDelimitedTablePaste', () => {
  it('inserts a table and prevents the native paste for spreadsheet text', () => {
    const preventDefault = vi.fn()
    const insertNodes = vi.fn()
    const editor = {
      api: { node: vi.fn(() => undefined) },
      selection: { anchor: { path: [0, 0] }, focus: { path: [0, 0] } },
      tf: { insertNodes },
    }
    const event = {
      clipboardData: {
        getData: vi.fn((format: string) =>
          format === 'text/plain' ? 'Name\tRole\nAda\tEngineer' : '',
        ),
      },
      preventDefault,
    }

    expect(handleDelimitedTablePaste(editor as never, event as never)).toBe(true)
    expect(insertNodes).toHaveBeenCalledWith(
      createDelimitedTableNode([
        ['Name', 'Role'],
        ['Ada', 'Engineer'],
      ]),
    )
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('does not hijack prose or paste inside a code block', () => {
    const insertNodes = vi.fn()
    const createEvent = (text: string) => ({
      clipboardData: {
        getData: vi.fn((format: string) => (format === 'text/plain' ? text : '')),
      },
      preventDefault: vi.fn(),
    })
    const proseEditor = {
      api: { node: vi.fn(() => undefined) },
      selection: { anchor: { path: [0, 0] }, focus: { path: [0, 0] } },
      tf: { insertNodes },
    }
    const codeEditor = {
      ...proseEditor,
      api: {
        node: vi.fn((path: number[]) =>
          path.length === 1 ? [{ children: [], type: 'code_block' }, path] : undefined,
        ),
      },
    }

    expect(
      handleDelimitedTablePaste(proseEditor as never, createEvent('ordinary prose') as never),
    ).toBe(false)
    expect(handleDelimitedTablePaste(codeEditor as never, createEvent('a\tb\n1\t2') as never)).toBe(
      false,
    )
    expect(insertNodes).not.toHaveBeenCalled()
  })

  it('inserts single-line comma prose as text without allowing a CSV fallback', () => {
    const preventDefault = vi.fn()
    const insertNodes = vi.fn()
    const insertText = vi.fn()
    const editor = {
      api: { node: vi.fn(() => undefined) },
      selection: { anchor: { path: [0, 0] }, focus: { path: [0, 0] } },
      tf: { insertNodes, insertText },
    }
    const event = {
      clipboardData: {
        getData: vi.fn((format: string) => (format === 'text/plain' ? 'Hello, world' : '')),
      },
      preventDefault,
    }

    expect(handleDelimitedTablePaste(editor as never, event as never)).toBe(true)
    expect(insertText).toHaveBeenCalledWith('Hello, world')
    expect(insertNodes).not.toHaveBeenCalled()
    expect(preventDefault).toHaveBeenCalledOnce()
  })

  it('leaves rich HTML clipboard content to the editor HTML paste pipeline', () => {
    const preventDefault = vi.fn()
    const insertNodes = vi.fn()
    const insertText = vi.fn()
    const editor = {
      api: { node: vi.fn(() => undefined) },
      selection: { anchor: { path: [0, 0] }, focus: { path: [0, 0] } },
      tf: { insertNodes, insertText },
    }
    const event = {
      clipboardData: {
        getData: vi.fn((format: string) =>
          format === 'text/html' ? '<strong>Hello, world</strong>' : 'Hello, world',
        ),
      },
      preventDefault,
    }

    expect(handleDelimitedTablePaste(editor as never, event as never)).toBe(false)
    expect(insertText).not.toHaveBeenCalled()
    expect(insertNodes).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
