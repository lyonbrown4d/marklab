import {
  getVimEditorRoot,
  onVimKeyboardScopeChange,
  registerVimCommandScope,
} from '@/components/vim/vimKeyboardScope'

type CommandPanel = {
  root: HTMLElement
  panel: HTMLElement
  localParent: Node
  localNext: ChildNode | null
  releaseScope: () => void
}
const panels = new Map<HTMLElement, CommandPanel>()
let host: HTMLElement | null = null
let selected: CommandPanel | null = null
let docked: CommandPanel | null = null
let moving = false
let unsubscribe: (() => void) | undefined

const movePanel = (session: CommandPanel, parent: Node, next: ChildNode | null = null) => {
  const focused = session.panel.ownerDocument.activeElement
  const input =
    focused instanceof HTMLInputElement && session.panel.contains(focused) ? focused : null
  const selection = input
    ? ([input.selectionStart, input.selectionEnd, input.selectionDirection] as const)
    : null
  // Some engines close their prompt on blur. A DOM move must preserve the
  // same prompt session even when the browser temporarily removes focus.
  const keepPromptOpen = (event: FocusEvent) => event.stopImmediatePropagation()
  input?.addEventListener('blur', keepPromptOpen, true)
  try {
    parent.insertBefore(session.panel, next?.parentNode === parent ? next : null)
  } finally {
    input?.removeEventListener('blur', keepPromptOpen, true)
  }
  if (input && selection) {
    input.focus({ preventScroll: true })
    if (selection[0] !== null && selection[1] !== null) {
      input.setSelectionRange(selection[0], selection[1], selection[2] ?? undefined)
    }
  }
}

const restore = (session: CommandPanel) => {
  if (session.panel.parentNode !== session.localParent) {
    movePanel(session, session.localParent, session.localNext)
  }
}

const synchronize = () => {
  if (moving) return
  moving = true
  try {
    const owner = getVimEditorRoot(document.activeElement)
    if (owner) selected = panels.get(owner) ?? null
    if (selected && selected.root.getAttribute('data-vim-active') !== 'true') selected = null
    const destination =
      host?.isConnected &&
      !host.closest('[hidden], [aria-hidden="true"]') &&
      selected &&
      !selected.root.closest('[role="dialog"]')
        ? host
        : null
    if (docked && (docked !== selected || docked.panel.parentNode !== destination)) {
      restore(docked)
      docked = null
    }
    if (selected && destination && selected.panel.parentNode !== destination) {
      movePanel(selected, destination)
      docked = selected
    }
  } finally {
    moving = false
  }
}

const watch = () => {
  unsubscribe ??= onVimKeyboardScopeChange(synchronize)
}
const stopWatchingIfIdle = () => {
  if (host || panels.size) return
  unsubscribe?.()
  unsubscribe = undefined
  selected = null
}

export const setVimCommandHost = (nextHost: HTMLElement | null): void => {
  host = nextHost
  watch()
  synchronize()
  stopWatchingIfIdle()
}

export const registerVimCommandPanel = (root: HTMLElement, panel: HTMLElement): (() => void) => {
  const parent = panel.parentNode
  if (!parent) return () => {}
  panels.get(root)?.releaseScope()
  const session: CommandPanel = {
    root,
    panel,
    localParent: parent,
    localNext: panel.nextSibling,
    releaseScope: registerVimCommandScope(root, panel),
  }
  panels.set(root, session)
  watch()
  synchronize()
  return () => {
    moving = true
    try {
      restore(session)
      if (docked === session) docked = null
      if (selected === session) selected = null
      if (panels.get(root) === session) panels.delete(root)
      session.releaseScope()
    } finally {
      moving = false
    }
    synchronize()
    stopWatchingIfIdle()
  }
}
