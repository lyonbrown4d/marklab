const EDITOR_CHROME_SELECTOR = [
  '[contenteditable="false"]',
  '[data-marklab-editor-chrome]',
  '[data-milkdown-block-handle]',
  '.embedded-preview-card',
  '.milkdown-toolbar',
  '.milkdown-block-handle',
  '.milkdown-block-drop-line',
  '.milkdown-drag-line',
  '.milkdown-drop-cursor',
  '.milkdown-dropcursor',
  '.milkdown-link-preview',
  '.milkdown-link-edit',
  '.milkdown-slash-menu',
  '.milkdown-code-block',
  '.ProseMirror-dropcursor',
  '.marklab-editor-drop-indicator',
].join(', ')

const EDITOR_SCROLL_VIEWPORT_SELECTOR = '.editor-scroll-viewport, .milkdown'

export const containsActiveElement = (root: HTMLElement | null) => {
  return Boolean(root && document.activeElement && root.contains(document.activeElement))
}

export const isEditorChromeTarget = (target: HTMLElement) => {
  return Boolean(target.closest('.ProseMirror') || target.closest(EDITOR_CHROME_SELECTOR))
}

export const scrollEditorViewportToTop = (scrollArea: HTMLElement | null) => {
  const viewport = scrollArea?.matches(EDITOR_SCROLL_VIEWPORT_SELECTOR)
    ? scrollArea
    : scrollArea?.querySelector<HTMLElement>(EDITOR_SCROLL_VIEWPORT_SELECTOR)
  viewport?.scrollTo({ top: 0 })
}
