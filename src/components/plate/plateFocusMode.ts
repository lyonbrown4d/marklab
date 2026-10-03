import type { PlateEditor } from 'platejs/react'

const ACTIVE_ATTRIBUTE = 'data-focus-active'

const resolveTopLevelBlock = (root: HTMLElement, element: HTMLElement) => {
  const parent = element.parentElement
  if (parent === root) return element
  if (parent?.hasAttribute('data-slate-chunk') && parent.parentElement === root) return element
  if (!parent?.hasAttribute('data-block-drag-wrapper')) return null

  const wrapperParent = parent.parentElement
  if (wrapperParent === root) return parent
  return wrapperParent?.hasAttribute('data-slate-chunk') && wrapperParent.parentElement === root
    ? parent
    : null
}

export const syncPlateFocusActiveBlock = (
  editor: PlateEditor,
  root: HTMLElement | null,
  previous: HTMLElement | null,
) => {
  previous?.removeAttribute(ACTIVE_ATTRIBUTE)
  root?.removeAttribute(ACTIVE_ATTRIBUTE)

  const topLevelIndex = editor.selection?.focus.path[0]
  if (!root?.classList.contains('is-focus-editor') || topLevelIndex === undefined) return null

  const node = editor.children[topLevelIndex]
  if (!node) return null

  const element = editor.api.toDOMNode(node)
  if (!element || !root.contains(element)) return null
  const activeBlock = resolveTopLevelBlock(root, element)
  if (!activeBlock) return null

  root.setAttribute(ACTIVE_ATTRIBUTE, 'true')
  activeBlock.setAttribute(ACTIVE_ATTRIBUTE, 'true')
  return activeBlock
}
