import { describe, expect, it, vi } from 'vitest'

import i18n from '@/i18n/setup'
import {
  createMarkdownTableToolbar,
  handleMarkdownTableKeydown,
  isMarkdownTableToolbarPointerTarget,
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

const mockRect = (
  element: Element,
  { height, left, top, width }: { height: number; left: number; top: number; width: number },
) => {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
  } as DOMRect)
}

describe('Markdown table editing', () => {
  it('keeps the toolbar visible while the pointer crosses between a table and its toolbar', () => {
    const host = document.createElement('div')
    const table = document.createElement('table')
    const cell = document.createElement('td')
    const toolbar = document.createElement('div')
    const toolbarButton = document.createElement('button')
    const outside = document.createElement('div')
    table.append(cell)
    toolbar.append(toolbarButton)
    host.append(table, toolbar, outside)
    expect(isMarkdownTableToolbarPointerTarget(toolbarButton, table, toolbar)).toBe(true)
    expect(isMarkdownTableToolbarPointerTarget(cell, table, toolbar)).toBe(true)
    expect(isMarkdownTableToolbarPointerTarget(outside, table, toolbar)).toBe(false)
    expect(isMarkdownTableToolbarPointerTarget(outside, null, toolbar)).toBe(false)
  })

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

  it('localizes visible labels and accessible names in Chinese', async () => {
    await i18n.changeLanguage('zh-CN')
    const toolbar = createMarkdownTableToolbar(createView(), createCommands())

    expect(toolbar.element.hidden).toBe(true)
    expect(toolbar.element).toHaveAttribute('aria-label', '表格编辑')
    expect(
      [...toolbar.element.querySelectorAll('button')].map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['添加行', '删除行', '添加列', '删除列', '左对齐', '居中对齐', '右对齐'])
    expect(
      [...toolbar.element.querySelectorAll('button')].map((button) => button.textContent),
    ).toEqual(['行 +', '行 −', '列 +', '列 −', '←', '↔', '→'])
    toolbar.destroy()
  })

  it('keeps English labels when English is active', async () => {
    await i18n.changeLanguage('en-US')
    const toolbar = createMarkdownTableToolbar(createView(), createCommands())

    expect(toolbar.element).toHaveAttribute('aria-label', 'Table editing')
    expect(
      [...toolbar.element.querySelectorAll('button')].map((button) => button.textContent),
    ).toEqual(['Row +', 'Row −', 'Col +', 'Col −', '←', '↔', '→'])
    toolbar.destroy()
  })

  it('updates an existing toolbar when the app language changes', async () => {
    await i18n.changeLanguage('en-US')
    const toolbar = createMarkdownTableToolbar(createView(), createCommands())

    await i18n.changeLanguage('zh-CN')

    expect(toolbar.element).toHaveAttribute('aria-label', '表格编辑')
    expect(toolbar.element.querySelector('[data-action="add-row"]')).toHaveTextContent('行 +')
    toolbar.destroy()
  })

  it('anchors the toolbar above the active cell in the scrolling editor coordinate space', () => {
    const toolbar = createMarkdownTableToolbar(createView(), createCommands())
    const host = document.createElement('div')
    const table = document.createElement('table')
    const cell = document.createElement('td')
    host.append(toolbar.element, table)
    table.append(cell)
    mockRect(host, { height: 400, left: 100, top: 50, width: 600 })
    mockRect(table, { height: 240, left: 180, top: 190, width: 500 })
    mockRect(cell, { height: 48, left: 300, top: 250, width: 120 })
    Object.defineProperties(host, {
      clientHeight: { configurable: true, value: 400 },
      clientWidth: { configurable: true, value: 600 },
      scrollTop: { configurable: true, value: 40 },
    })
    Object.defineProperties(toolbar.element, {
      offsetHeight: { configurable: true, value: 32 },
      offsetWidth: { configurable: true, value: 300 },
    })

    toolbar.show(table, cell)

    expect(toolbar.element.style.left).toBe('110px')
    expect(toolbar.element.style.top).toBe('200px')
    expect(toolbar.element.dataset.placement).toBe('above')
    expect(toolbar.element.style.getPropertyValue('--marklab-table-anchor-x')).toBe('150px')
    toolbar.destroy()
  })

  it('flips below the cell and clamps within the visible editor edges', () => {
    const toolbar = createMarkdownTableToolbar(createView(), createCommands())
    const host = document.createElement('div')
    const table = document.createElement('table')
    const cell = document.createElement('td')
    host.append(toolbar.element, table)
    table.append(cell)
    mockRect(host, { height: 220, left: 100, top: 100, width: 360 })
    mockRect(table, { height: 180, left: 120, top: 104, width: 330 })
    mockRect(cell, { height: 40, left: 420, top: 108, width: 30 })
    Object.defineProperties(host, {
      clientHeight: { configurable: true, value: 220 },
      clientWidth: { configurable: true, value: 360 },
    })
    Object.defineProperties(toolbar.element, {
      offsetHeight: { configurable: true, value: 32 },
      offsetWidth: { configurable: true, value: 300 },
    })

    toolbar.show(table, cell)

    expect(toolbar.element.style.left).toBe('52px')
    expect(toolbar.element.style.top).toBe('56px')
    expect(toolbar.element.dataset.placement).toBe('below')
    expect(toolbar.element.style.getPropertyValue('--marklab-table-anchor-x')).toBe('283px')
    toolbar.destroy()
  })
})
