import { $prose } from '@milkdown/kit/utils'
import { Plugin, type Command } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import {
  addColumnAfter,
  addRowAfter,
  deleteColumn,
  deleteRow,
  goToNextCell,
  isInTable,
  setCellAttr,
} from '@milkdown/kit/prose/tables'

export type MarkdownTableAction =
  | 'add-row'
  | 'delete-row'
  | 'add-column'
  | 'delete-column'
  | 'align-left'
  | 'align-center'
  | 'align-right'

export type MarkdownTableCommandSet = {
  addColumnAfter: Command
  addRowAfter: Command
  alignCenter: Command
  alignLeft: Command
  alignRight: Command
  deleteColumn: Command
  deleteRow: Command
  goToNextCell: Command
  goToPreviousCell: Command
  isInTable: (state: EditorView['state']) => boolean
}

const defaultCommands: MarkdownTableCommandSet = {
  addColumnAfter,
  addRowAfter,
  alignCenter: setCellAttr('alignment', 'center'),
  alignLeft: setCellAttr('alignment', 'left'),
  alignRight: setCellAttr('alignment', 'right'),
  deleteColumn,
  deleteRow,
  goToNextCell: goToNextCell(1),
  goToPreviousCell: goToNextCell(-1),
  isInTable,
}

const actionCommands: Record<MarkdownTableAction, keyof MarkdownTableCommandSet> = {
  'add-row': 'addRowAfter',
  'delete-row': 'deleteRow',
  'add-column': 'addColumnAfter',
  'delete-column': 'deleteColumn',
  'align-left': 'alignLeft',
  'align-center': 'alignCenter',
  'align-right': 'alignRight',
}

export const runMarkdownTableAction = (
  view: EditorView,
  action: MarkdownTableAction,
  commands: MarkdownTableCommandSet = defaultCommands,
): boolean => {
  const command = commands[actionCommands[action]] as Command
  const handled = command(view.state, view.dispatch)
  if (handled) view.focus()
  return handled
}

export const handleMarkdownTableKeydown = (
  view: EditorView,
  event: KeyboardEvent,
  commands: MarkdownTableCommandSet = defaultCommands,
): boolean => {
  if (!commands.isInTable(view.state) || event.defaultPrevented || event.isComposing) return false

  if (event.key === 'Tab') {
    const navigate = event.shiftKey ? commands.goToPreviousCell : commands.goToNextCell
    if (navigate(view.state, view.dispatch)) return true
    if (event.shiftKey || !commands.addRowAfter(view.state, view.dispatch)) return false
    return commands.goToNextCell(view.state, view.dispatch)
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    return commands.addRowAfter(view.state, view.dispatch)
  }
  return false
}

const toolbarItems: ReadonlyArray<{
  action: MarkdownTableAction
  label: string
  text: string
}> = [
  { action: 'add-row', label: 'Add row', text: 'Row +' },
  { action: 'delete-row', label: 'Delete row', text: 'Row −' },
  { action: 'add-column', label: 'Add column', text: 'Col +' },
  { action: 'delete-column', label: 'Delete column', text: 'Col −' },
  { action: 'align-left', label: 'Align left', text: '←' },
  { action: 'align-center', label: 'Align center', text: '↔' },
  { action: 'align-right', label: 'Align right', text: '→' },
]

export const createMarkdownTableToolbar = (
  view: EditorView,
  commands: MarkdownTableCommandSet = defaultCommands,
) => {
  const element = document.createElement('div')
  element.className = 'marklab-table-toolbar'
  element.hidden = true
  element.setAttribute('role', 'toolbar')
  element.setAttribute('aria-label', 'Table editing')

  toolbarItems.forEach(({ action, label, text }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = action
    button.setAttribute('aria-label', label)
    button.title = label
    button.textContent = text
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => runMarkdownTableAction(view, action, commands))
    element.append(button)
  })

  return {
    destroy: () => element.remove(),
    element,
    hide: () => {
      element.hidden = true
    },
    show: (table: HTMLTableElement) => {
      element.hidden = false
      element.style.left = `${table.offsetLeft}px`
      element.style.top = `${Math.max(0, table.offsetTop - element.offsetHeight - 6)}px`
    },
  }
}

export const markdownTableEditingPlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleKeyDown: (view, event) => handleMarkdownTableKeydown(view, event),
      },
      view: (view) => {
        const parent = view.dom.parentElement
        const toolbar = createMarkdownTableToolbar(view)
        let hoveredTable: HTMLTableElement | null = null
        parent?.classList.add('marklab-table-toolbar-host')
        parent?.append(toolbar.element)

        const selectedTable = (): HTMLTableElement | null => {
          if (!isInTable(view.state)) return null
          const dom = view.domAtPos(view.state.selection.from).node
          const element = dom instanceof Element ? dom : dom.parentElement
          return element?.closest('table') ?? null
        }
        const updateToolbar = () => {
          const table = selectedTable() ?? hoveredTable
          if (table) toolbar.show(table)
          else toolbar.hide()
        }
        const onPointerOver = (event: PointerEvent) => {
          const target = event.target
          hoveredTable = target instanceof Element ? target.closest('table') : null
          updateToolbar()
        }
        const onPointerOut = (event: PointerEvent) => {
          const next = event.relatedTarget
          if (next instanceof Element && next.closest('table') === hoveredTable) return
          hoveredTable = null
          updateToolbar()
        }
        view.dom.addEventListener('pointerover', onPointerOver)
        view.dom.addEventListener('pointerout', onPointerOut)
        updateToolbar()

        return {
          destroy: () => {
            view.dom.removeEventListener('pointerover', onPointerOver)
            view.dom.removeEventListener('pointerout', onPointerOut)
            parent?.classList.remove('marklab-table-toolbar-host')
            toolbar.destroy()
          },
          update: updateToolbar,
        }
      },
    }),
)
