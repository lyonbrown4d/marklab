import type { TNode } from 'platejs'
import type { PlateEditor } from 'platejs/react'

const DEFAULT_CHARACTER_BUDGET = 1_200
const DEFAULT_NEARBY_BLOCK_LIMIT = 2
const MAX_HEADING_SCAN_BLOCKS = 256
const DISABLED_NODE_TYPES = new Set([
  'code_block',
  'codeBlock',
  'frontmatter',
  'front_matter',
  'yaml',
  'table',
  'tr',
  'td',
  'th',
])

export type PlateInlineCompletionContext = {
  after: string
  before: string
  blockId: string
  blockOffset: number
  followingBlocks: readonly string[]
  heading: string | null
  nodeType: string
  precedingBlocks: readonly string[]
}

export type PlateInlineCompletionContextOptions = {
  characterBudget?: number
  nearbyBlockLimit?: number
}

const nodeType = (node: TNode) => {
  const type = 'type' in node ? node.type : undefined
  return typeof type === 'string' ? type : ''
}

const isDisabledNode = (node: TNode) => {
  const type = nodeType(node)
  return DISABLED_NODE_TYPES.has(type) || type.startsWith('table_')
}

const hasDisabledAncestor = (editor: PlateEditor) => {
  const path = editor.selection?.focus.path
  if (!path) return true
  for (let depth = 1; depth < path.length; depth += 1) {
    const entry = editor.api.node(path.slice(0, depth))
    if (entry && isDisabledNode(entry[0])) return true
  }
  return false
}

const hasInlineCode = (editor: PlateEditor) => {
  const marks = editor.api.marks() as Record<string, unknown> | null
  if (marks?.code || marks?.inlineCode) return true
  const leaf = editor.selection ? editor.api.leaf(editor.selection.focus)?.[0] : null
  if (!leaf) return false
  const leafMarks = leaf as Record<string, unknown>
  return Boolean(leafMarks.code || leafMarks.inlineCode)
}

const takeStart = (value: string, remaining: number) => value.slice(0, Math.max(0, remaining))
const takeEnd = (value: string, remaining: number) =>
  remaining > 0 ? value.slice(Math.max(0, value.length - remaining)) : ''

export const buildPlateInlineCompletionContext = (
  editor: PlateEditor,
  options: PlateInlineCompletionContextOptions = {},
): PlateInlineCompletionContext | null => {
  if (!editor.selection || !editor.api.isCollapsed() || hasDisabledAncestor(editor)) return null
  if (hasInlineCode(editor)) return null
  const block = editor.api.block()
  if (!block || isDisabledNode(block[0])) return null
  const start = editor.api.start(block[1])
  const end = editor.api.end(block[1])
  if (!start || !end) return null

  const budget = Math.max(1, options.characterBudget ?? DEFAULT_CHARACTER_BUDGET)
  const nearbyLimit = Math.max(0, options.nearbyBlockLimit ?? DEFAULT_NEARBY_BLOCK_LIMIT)
  let remaining = budget
  const blockBefore = editor.api.string({ anchor: start, focus: editor.selection.focus })
  const before = takeEnd(blockBefore, remaining)
  remaining -= before.length
  const after = takeStart(
    editor.api.string({ anchor: editor.selection.focus, focus: end }),
    remaining,
  )
  remaining -= after.length

  const topLevelIndex = editor.selection.focus.path[0]
  if (topLevelIndex === undefined) return null
  const blockNode = editor.children[topLevelIndex]
  const candidateBlockId =
    blockNode && 'id' in blockNode && typeof blockNode.id === 'string' ? blockNode.id : null
  let headingIndex = -1
  const headingScanStart = Math.max(0, topLevelIndex - MAX_HEADING_SCAN_BLOCKS)
  for (let index = topLevelIndex - 1; index >= headingScanStart; index -= 1) {
    const node = editor.children[index]
    if (node && /^h[1-6]$|^heading$/u.test(nodeType(node))) {
      headingIndex = index
      break
    }
  }
  const heading = headingIndex >= 0 ? takeEnd(editor.api.string([headingIndex]), remaining) : ''
  remaining -= heading.length

  const precedingBlocks: string[] = []
  const precedingStart = Math.max(0, topLevelIndex - nearbyLimit - 1)
  for (let index = precedingStart; index < topLevelIndex; index += 1) {
    const node = editor.children[index]
    if (!node || isDisabledNode(node) || /^h[1-6]$|^heading$/u.test(nodeType(node))) continue
    const text = takeEnd(editor.api.string([index]), remaining)
    if (text) precedingBlocks.push(text)
    remaining -= text.length
  }
  if (precedingBlocks.length > nearbyLimit)
    precedingBlocks.splice(0, precedingBlocks.length - nearbyLimit)

  const followingBlocks: string[] = []
  for (let index = topLevelIndex + 1; index < editor.children.length; index += 1) {
    const node = editor.children[index]
    if (!node || isDisabledNode(node)) continue
    const text = takeStart(editor.api.string([index]), remaining)
    if (text) followingBlocks.push(text)
    remaining -= text.length
    if (followingBlocks.length >= nearbyLimit || remaining <= 0) break
  }

  return {
    after,
    before,
    blockId: candidateBlockId || `block:${topLevelIndex}`,
    blockOffset: blockBefore.length,
    followingBlocks,
    heading: heading || null,
    nodeType: nodeType(block[0]),
    precedingBlocks,
  }
}
