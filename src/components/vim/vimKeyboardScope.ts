const scopeAttribute = 'data-vim-active'
const scopeChangedEvent = 'marklab:vim-keyboard-scope-changed'
const commandRoots = new WeakMap<Element, HTMLElement>()

export const getVimEditorRoot = (target: EventTarget | null): HTMLElement | null => {
  if (!(target instanceof Element)) return null
  const panel = target.closest('[data-vim-command-panel]')
  const owner = panel ? commandRoots.get(panel) : undefined
  if (owner?.getAttribute(scopeAttribute) === 'true') return owner
  return target.closest<HTMLElement>(`[${scopeAttribute}="true"]`)
}

export const isVimKeyboardTarget = (target: EventTarget | null): boolean =>
  getVimEditorRoot(target) !== null

export const registerVimCommandScope = (root: HTMLElement, panel: HTMLElement): (() => void) => {
  panel.setAttribute('data-vim-command-panel', '')
  commandRoots.set(panel, root)
  return () => {
    commandRoots.delete(panel)
    panel.removeAttribute('data-vim-command-panel')
    notifyScopeChange(root)
  }
}

const notifyScopeChange = (root: HTMLElement) =>
  root.ownerDocument.dispatchEvent(new Event(scopeChangedEvent))

export const reportVimMode = (root: HTMLElement, mode: string): void => {
  root.setAttribute('data-vim-mode', mode.toUpperCase())
  notifyScopeChange(root)
}

export const getFocusedVimMode = (): string | null => {
  if (typeof document === 'undefined' || !document.hasFocus()) return null
  const root = getVimEditorRoot(document.activeElement)
  return root ? (root.getAttribute('data-vim-mode') ?? 'NORMAL') : null
}

export const registerVimKeyboardScope = (root: HTMLElement): (() => void) => {
  root.setAttribute(scopeAttribute, 'true')
  notifyScopeChange(root)
  return () => {
    root.removeAttribute(scopeAttribute)
    root.removeAttribute('data-vim-mode')
    notifyScopeChange(root)
  }
}

export const onVimKeyboardScopeChange = (handler: () => void): (() => void) => {
  document.addEventListener(scopeChangedEvent, handler)
  document.addEventListener('focusin', handler)
  document.addEventListener('focusout', handler)
  window.addEventListener('focus', handler)
  window.addEventListener('blur', handler)
  return () => {
    document.removeEventListener(scopeChangedEvent, handler)
    document.removeEventListener('focusin', handler)
    document.removeEventListener('focusout', handler)
    window.removeEventListener('focus', handler)
    window.removeEventListener('blur', handler)
  }
}
