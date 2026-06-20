type FocusedEditAction =
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.cut'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.select_all'

const editCommandByAction: Record<FocusedEditAction, string> = {
  'edit.undo': 'undo',
  'edit.redo': 'redo',
  'edit.cut': 'cut',
  'edit.copy': 'copy',
  'edit.paste': 'paste',
  'edit.select_all': 'selectAll',
}

export const executeFocusedEditCommand = (
  action: string,
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
) => {
  if (!doc || !isFocusedEditAction(action)) return false

  const target = findFocusedEditableTarget(doc)
  if (!target) return false

  if (action === 'edit.select_all') {
    return selectEditableTarget(target, doc)
  }

  return Boolean(doc.execCommand(editCommandByAction[action]))
}

const isFocusedEditAction = (action: string): action is FocusedEditAction => {
  return Object.prototype.hasOwnProperty.call(editCommandByAction, action)
}

const findFocusedEditableTarget = (doc: Document): HTMLElement | null => {
  const activeElement = doc.activeElement
  if (!isElement(activeElement)) return null

  let current: HTMLElement | null = activeElement
  while (current) {
    if (isEditableTarget(current)) return current
    current = current.parentElement
  }

  return null
}

const isElement = (element: Element | null): element is HTMLElement => {
  if (!element) return false
  const view = element.ownerDocument.defaultView
  return view ? element instanceof view.HTMLElement : element instanceof HTMLElement
}

const isEditableTarget = (element: HTMLElement) => {
  if (isTextInput(element)) return true
  if (element.isContentEditable) return true
  if (element.contentEditable === 'true') return true
  if (element.getAttribute('contenteditable') === 'true') return true
  return element.classList.contains('ProseMirror')
}

const isTextInput = (element: HTMLElement): element is HTMLInputElement | HTMLTextAreaElement => {
  const view = element.ownerDocument.defaultView
  if (!view) return false
  if (element instanceof view.HTMLTextAreaElement) return !element.disabled && !element.readOnly
  if (!(element instanceof view.HTMLInputElement)) return false
  if (element.disabled || element.readOnly) return false
  return ![
    'button',
    'checkbox',
    'color',
    'file',
    'hidden',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ].includes(element.type)
}

const selectEditableTarget = (target: HTMLElement, doc: Document) => {
  target.focus({ preventScroll: true })

  if (isTextInput(target)) {
    target.select()
    return true
  }

  const selection = doc.getSelection()
  if (!selection) return false

  const range = doc.createRange()
  range.selectNodeContents(target)
  selection.removeAllRanges()
  selection.addRange(range)
  return true
}
