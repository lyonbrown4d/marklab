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
import i18n from '@/i18n/setup'
import { createMarkdownTableToolbarScheduler } from '@/components/milkdown/tableToolbarScheduler'

export { createMarkdownTableToolbarScheduler } from '@/components/milkdown/tableToolbarScheduler'

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
  labelKey: string
  text: string
  textKey?: string
}> = [
  {
    action: 'add-row',
    labelKey: 'editor.tableAddRow',
    text: 'Row +',
    textKey: 'editor.tableRowAdd',
  },
  {
    action: 'delete-row',
    labelKey: 'editor.tableDeleteRow',
    text: 'Row −',
    textKey: 'editor.tableRowDelete',
  },
  {
    action: 'add-column',
    labelKey: 'editor.tableAddColumn',
    text: 'Col +',
    textKey: 'editor.tableColumnAdd',
  },
  {
    action: 'delete-column',
    labelKey: 'editor.tableDeleteColumn',
    text: 'Col −',
    textKey: 'editor.tableColumnDelete',
  },
  { action: 'align-left', labelKey: 'editor.tableAlignLeft', text: '←' },
  { action: 'align-center', labelKey: 'editor.tableAlignCenter', text: '↔' },
  { action: 'align-right', labelKey: 'editor.tableAlignRight', text: '→' },
]

const TOOLBAR_EDGE_GAP = 8
const TOOLBAR_ANCHOR_INSET = 17

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum)

export const isMarkdownTableToolbarPointerTarget = (
  target: EventTarget | null,
  activeTable: HTMLTableElement | null,
  toolbarElement: HTMLElement,
): boolean => {
  if (!(target instanceof Node)) return false
  if (toolbarElement.contains(target)) return true
  return Boolean(
    activeTable && target instanceof Element && target.closest('table') === activeTable,
  )
}

export const createMarkdownTableToolbar = (
  view: EditorView,
  commands: MarkdownTableCommandSet = defaultCommands,
) => {
  const element = document.createElement('div')
  element.className = 'marklab-table-toolbar'
  element.hidden = true
  element.setAttribute('role', 'toolbar')

  const buttons = toolbarItems.map(({ action, text }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.action = action
    button.textContent = text
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => runMarkdownTableAction(view, action, commands))
    element.append(button)
    return button
  })

  const localize = () => {
    element.setAttribute('aria-label', i18n.t('editor.tableEditing'))
    toolbarItems.forEach(({ labelKey, text, textKey }, index) => {
      const button = buttons[index]
      if (!button) return
      const label = i18n.t(labelKey)
      button.setAttribute('aria-label', label)
      button.title = label
      button.textContent = textKey ? i18n.t(textKey) : text
    })
  }
  localize()
  i18n.on('languageChanged', localize)

  return {
    destroy: () => {
      i18n.off('languageChanged', localize)
      element.remove()
    },
    element,
    hide: () => {
      element.hidden = true
    },
    show: (table: HTMLTableElement, activeCell?: HTMLTableCellElement | null) => {
      element.hidden = false
      const host = element.parentElement
      if (!host) return

      const anchorRect = (activeCell ?? table).getBoundingClientRect()
      const hostRect = host.getBoundingClientRect()
      const hostHeight = host.clientHeight || hostRect.height
      const hostWidth = host.clientWidth || hostRect.width
      const toolbarHeight = element.offsetHeight
      const toolbarWidth = element.offsetWidth
      const visibleLeft = host.scrollLeft + TOOLBAR_EDGE_GAP
      const visibleTop = host.scrollTop + TOOLBAR_EDGE_GAP
      const visibleRight = host.scrollLeft + hostWidth - TOOLBAR_EDGE_GAP
      const visibleBottom = host.scrollTop + hostHeight - TOOLBAR_EDGE_GAP
      const anchorX = anchorRect.left - hostRect.left + host.scrollLeft + anchorRect.width / 2
      const left = clamp(
        anchorX - toolbarWidth / 2,
        visibleLeft,
        Math.max(visibleLeft, visibleRight - toolbarWidth),
      )
      const above =
        anchorRect.top - hostRect.top + host.scrollTop - toolbarHeight - TOOLBAR_EDGE_GAP
      const below = anchorRect.bottom - hostRect.top + host.scrollTop + TOOLBAR_EDGE_GAP
      const fitsAbove = above >= visibleTop
      const fitsBelow = below + toolbarHeight <= visibleBottom
      const placement = fitsAbove || !fitsBelow ? 'above' : 'below'
      const requestedTop = placement === 'above' ? above : below
      const top = clamp(
        requestedTop,
        visibleTop,
        Math.max(visibleTop, visibleBottom - toolbarHeight),
      )

      element.dataset.placement = placement
      element.style.left = `${Math.round(left)}px`
      element.style.top = `${Math.round(top)}px`
      element.style.setProperty(
        '--marklab-table-anchor-x',
        `${Math.round(clamp(anchorX - left, TOOLBAR_ANCHOR_INSET, toolbarWidth - TOOLBAR_ANCHOR_INSET))}px`,
      )
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

        const selectedTable = () => {
          if (!isInTable(view.state)) return null
          const dom = view.domAtPos(view.state.selection.from).node
          const element = dom instanceof Element ? dom : dom.parentElement
          const table = element?.closest<HTMLTableElement>('table') ?? null
          if (!table) return null
          return {
            cell: element?.closest<HTMLTableCellElement>('td, th') ?? null,
            table,
          }
        }
        const updateToolbar = () => {
          const selection = selectedTable()
          const table = selection?.table ?? hoveredTable
          if (table) toolbar.show(table, selection?.cell)
          else toolbar.hide()
        }
        const toolbarScheduler = createMarkdownTableToolbarScheduler(updateToolbar)
        const onPointerOver = (event: PointerEvent) => {
          const target = event.target
          hoveredTable = target instanceof Element ? target.closest('table') : null
          toolbarScheduler.schedule()
        }
        const onPointerOut = (event: PointerEvent) => {
          if (
            isMarkdownTableToolbarPointerTarget(event.relatedTarget, hoveredTable, toolbar.element)
          ) {
            return
          }
          hoveredTable = null
          toolbarScheduler.schedule()
        }
        view.dom.addEventListener('pointerover', onPointerOver)
        view.dom.addEventListener('pointerout', onPointerOut)
        toolbar.element.addEventListener('pointerout', onPointerOut)
        toolbarScheduler.schedule()

        return {
          destroy: () => {
            toolbarScheduler.cancel()
            view.dom.removeEventListener('pointerover', onPointerOver)
            view.dom.removeEventListener('pointerout', onPointerOut)
            toolbar.element.removeEventListener('pointerout', onPointerOut)
            parent?.classList.remove('marklab-table-toolbar-host')
            toolbar.destroy()
          },
          update: toolbarScheduler.schedule,
        }
      },
    }),
)
