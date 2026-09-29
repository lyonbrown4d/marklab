import { describe, expect, it, vi } from 'vitest'

import {
  createMarkdownTableToolbar,
  handleMarkdownTableKeydown,
  runMarkdownTableAction,
  type MarkdownTableCommandSet,
} from '@/components/milkdown/tableEditingPlugin'

const createCommands = (): MarkdownTableCommandSet => ({
  addColumnAfter: vi.fn(() => true),
  addRowAfter: vi.fn(() => true),
  alignCenter: vi.fn(() => true),
  alignLeft: vi.fn(() => true),
  alignRight: vi.fn(() => true),
  deleteColumn: vi.fn(() => true),
  deleteRow: vi.fn(() => true),
  goToNextCell: vi.fn(() => true),
  goToPreviousCell: vi.fn(() => true),
  isInTable: vi.fn(() => true),
})

const createView = () =>
  ({
    dispatch: vi.fn(),
    focus: vi.fn(),
    state: { selection: { from: 1 } },
  }) as never

describe('Markdown table editing', () => {
  it('adds a final row and moves into it when Tab reaches the last cell', () => {
    const commands = createCommands()
    vi.mocked(commands.goToNextCell).mockReturnValueOnce(false).mockReturnValueOnce(true)
    const event = new KeyboardEvent('keydown', { key: 'Tab' })
    const view = createView()

    expect(handleMarkdownTableKeydown(view, event, commands)).toBe(true)
    expect(commands.addRowAfter).toHaveBeenCalledTimes(1)
    expect(commands.goToNextCell).toHaveBeenCalledTimes(2)
  })

  it('adds a row below the current row with Mod+Enter', () => {
    const commands = createCommands()
    const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'Enter' })

    expect(handleMarkdownTableKeydown(createView(), event, commands)).toBe(true)
    expect(commands.addRowAfter).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['add-row', 'addRowAfter'],
    ['delete-row', 'deleteRow'],
    ['add-column', 'addColumnAfter'],
    ['delete-column', 'deleteColumn'],
    ['align-left', 'alignLeft'],
    ['align-center', 'alignCenter'],
    ['align-right', 'alignRight'],
  ] as const)('maps %s to the mature ProseMirror table command', (action, command) => {
    const commands = createCommands()

    expect(runMarkdownTableAction(createView(), action, commands)).toBe(true)
    expect(commands[command]).toHaveBeenCalledTimes(1)
  })

  it('creates a keyboard-accessible low-profile toolbar', () => {
    const toolbar = createMarkdownTableToolbar(createView(), createCommands())

    expect(toolbar.element.hidden).toBe(true)
    expect(
      [...toolbar.element.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual([
      'Add row',
      'Delete row',
      'Add column',
      'Delete column',
      'Align left',
      'Align center',
      'Align right',
    ])
    toolbar.destroy()
  })
})
