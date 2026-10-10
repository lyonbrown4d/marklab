import type { PlateEditor } from 'platejs/react'

const ACTIVE_ATTRIBUTE = 'data-focus-active'
const CONTEXT_ATTRIBUTE = 'data-focus-context'
const PRIMARY_ATTRIBUTE = 'data-focus-primary'

export type PlateFocusState = {
  active: HTMLElement[]
  context: HTMLElement[]
  primary: HTMLElement | null
}

export const EMPTY_PLATE_FOCUS_STATE: PlateFocusState = {
  active: [],
  context: [],
  primary: null,
}

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

const getHeadingLevel = (node: unknown) => {
  if (!node || typeof node !== 'object' || !('type' in node)) return null
  const type = (node as { type?: unknown }).type
  if (typeof type !== 'string') return null
  const match = /^h([1-6])$/.exec(type)
  return match ? Number(match[1]) : null
}

const getSectionRange = (nodes: PlateEditor['children'], focusIndex: number) => {
  let start = focusIndex
  let level: number | null = null

  for (let index = focusIndex; index >= 0; index -= 1) {
    const headingLevel = getHeadingLevel(nodes[index])
    if (headingLevel === null) continue
    start = index
    level = headingLevel
    break
  }

  if (level === null) return null

  let end = nodes.length - 1
  for (let index = start + 1; index < nodes.length; index += 1) {
    const headingLevel = getHeadingLevel(nodes[index])
    if (headingLevel !== null && headingLevel <= level) {
      end = index - 1
      break
    }
  }

  return { start, end }
}

const resolveBlockAtIndex = (editor: PlateEditor, root: HTMLElement, index: number) => {
  const node = editor.children[index]
  if (!node) return null
  const element = editor.api.toDOMNode(node)
  if (!element || !root.contains(element)) return null
  return resolveTopLevelBlock(root, element)
}

export const clearPlateFocusMode = (root: HTMLElement | null, state: PlateFocusState) => {
  state.active.forEach((element) => element.removeAttribute(ACTIVE_ATTRIBUTE))
  state.context.forEach((element) => element.removeAttribute(CONTEXT_ATTRIBUTE))
  state.primary?.removeAttribute(PRIMARY_ATTRIBUTE)
  root?.removeAttribute(ACTIVE_ATTRIBUTE)
}

export const syncPlateFocusMode = (
  editor: PlateEditor,
  root: HTMLElement | null,
  previous: PlateFocusState,
): PlateFocusState => {
  clearPlateFocusMode(root, previous)

  const selection = editor.selection
  if (!root?.classList.contains('is-focus-editor') || !selection) {
    return EMPTY_PLATE_FOCUS_STATE
  }

  const anchorIndex = selection.anchor.path[0]
  const focusIndex = selection.focus.path[0]
  if (anchorIndex === undefined || focusIndex === undefined) return EMPTY_PLATE_FOCUS_STATE

  const activeIndices = new Set<number>()
  const selectionStart = Math.min(anchorIndex, focusIndex)
  const selectionEnd = Math.max(anchorIndex, focusIndex)
  for (let index = selectionStart; index <= selectionEnd; index += 1) activeIndices.add(index)

  if (root.classList.contains('is-focus-scope-section')) {
    const section = getSectionRange(editor.children, focusIndex)
    if (section) {
      for (let index = section.start; index <= section.end; index += 1) activeIndices.add(index)
    }
  }

  const sortedIndices = [...activeIndices].sort((left, right) => left - right)
  const active = sortedIndices
    .map((index) => resolveBlockAtIndex(editor, root, index))
    .filter((element): element is HTMLElement => element !== null)
  const primary = resolveBlockAtIndex(editor, root, focusIndex)
  if (!primary || active.length === 0) return EMPTY_PLATE_FOCUS_STATE

  const contextIndices = [sortedIndices[0] - 1, sortedIndices.at(-1)! + 1].filter(
    (index) => index >= 0 && index < editor.children.length && !activeIndices.has(index),
  )
  const context = contextIndices
    .map((index) => resolveBlockAtIndex(editor, root, index))
    .filter((element): element is HTMLElement => element !== null)

  root.setAttribute(ACTIVE_ATTRIBUTE, 'true')
  active.forEach((element) => element.setAttribute(ACTIVE_ATTRIBUTE, 'true'))
  context.forEach((element) => element.setAttribute(CONTEXT_ATTRIBUTE, 'true'))
  primary.setAttribute(PRIMARY_ATTRIBUTE, 'true')

  return { active, context, primary }
}
