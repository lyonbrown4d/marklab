import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import type { EditorState } from '@milkdown/kit/prose/state'

const DEFAULT_CHARACTER_BUDGET = 1_200
const DEFAULT_NEARBY_BLOCK_LIMIT = 2
const MIN_SCAN_RADIUS = 512
const MAX_SCAN_RADIUS = 4_096
const DISABLED_NODE_NAMES = new Set([
  'code_block',
  'codeBlock',
  'frontmatter',
  'front_matter',
  'yaml',
  'table',
  'table_row',
  'table_cell',
  'table_header',
])

export type AiInlineCompletionContext = {
  after: string
  before: string
  followingBlocks: readonly string[]
  heading: string | null
  nodeType: string
  precedingBlocks: readonly string[]
}

export type AiInlineCompletionContextOptions = {
  characterBudget?: number
  nearbyBlockLimit?: number
}

type Textblock = {
  node: ProseMirrorNode
  position: number
}

const isDisabledNode = (node: ProseMirrorNode) =>
  node.type.spec.code === true ||
  DISABLED_NODE_NAMES.has(node.type.name) ||
  node.type.name.startsWith('table_')

export const isAiInlineCompletionSelectionEligible = (state: EditorState) => {
  const { selection } = state
  if (!selection.empty || !selection.$from.parent.isTextblock) return false

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    if (isDisabledNode(selection.$from.node(depth))) return false
  }
  if (selection.$from.marks().some((mark) => mark.type.name.toLocaleLowerCase().includes('code'))) {
    return false
  }

  return true
}

const collectNearbyTextblocks = (
  doc: ProseMirrorNode,
  currentPosition: number,
  characterBudget: number,
) => {
  const blocks: Textblock[] = []
  const radius = Math.min(MAX_SCAN_RADIUS, Math.max(MIN_SCAN_RADIUS, characterBudget * 4))
  const from = Math.max(0, currentPosition - radius)
  const to = Math.min(doc.content.size, currentPosition + radius)
  doc.nodesBetween(from, to, (node, position) => {
    if (isDisabledNode(node)) return false
    if (!node.isTextblock) return true
    blocks.push({ node, position })
    return false
  })
  return blocks
}

const takeStart = (text: string, remaining: number) => text.slice(0, Math.max(0, remaining))

const takeEnd = (text: string, remaining: number) =>
  remaining > 0 ? text.slice(Math.max(0, text.length - remaining)) : ''

export const buildAiInlineCompletionLocalContext = (
  state: EditorState,
  options: AiInlineCompletionContextOptions = {},
): AiInlineCompletionContext | null => {
  if (!isAiInlineCompletionSelectionEligible(state)) return null
  const budget = Math.max(1, options.characterBudget ?? DEFAULT_CHARACTER_BUDGET)
  const { $from } = state.selection
  let remaining = budget
  const before = takeEnd($from.parent.textBetween(0, $from.parentOffset), remaining)
  remaining -= before.length
  const after = takeStart(
    $from.parent.textBetween($from.parentOffset, $from.parent.content.size),
    remaining,
  )
  return {
    after,
    before,
    followingBlocks: [],
    heading: null,
    nodeType: $from.parent.type.name,
    precedingBlocks: [],
  }
}

export const buildAiInlineCompletionContext = (
  state: EditorState,
  options: AiInlineCompletionContextOptions = {},
): AiInlineCompletionContext | null => {
  const budget = Math.max(1, options.characterBudget ?? DEFAULT_CHARACTER_BUDGET)
  const nearbyLimit = Math.max(0, options.nearbyBlockLimit ?? DEFAULT_NEARBY_BLOCK_LIMIT)
  const local = buildAiInlineCompletionLocalContext(state, options)
  if (!local) return null
  const { $from } = state.selection
  const currentPosition = $from.start($from.depth) - 1
  const blocks = collectNearbyTextblocks(state.doc, currentPosition, budget)
  const currentIndex = blocks.findIndex(({ position }) => position === currentPosition)
  if (currentIndex < 0) return null

  let remaining = budget
  const before = local.before
  remaining -= before.length
  const after = takeStart(local.after, remaining)
  remaining -= after.length

  const headingBlock = blocks
    .slice(0, currentIndex)
    .reverse()
    .find(({ node }) => node.type.name === 'heading')
  const heading = headingBlock ? takeEnd(headingBlock.node.textContent, remaining) : ''
  remaining -= heading.length

  const precedingBlocks: string[] = []
  const preceding = blocks
    .slice(0, currentIndex)
    .filter(({ node }) => node.type.name !== 'heading')
    .slice(-nearbyLimit)
  for (const { node } of preceding) {
    const text = takeEnd(node.textContent, remaining)
    if (text) precedingBlocks.push(text)
    remaining -= text.length
  }

  const followingBlocks: string[] = []
  for (const { node } of blocks.slice(currentIndex + 1, currentIndex + 1 + nearbyLimit)) {
    const text = takeStart(node.textContent, remaining)
    if (text) followingBlocks.push(text)
    remaining -= text.length
  }

  return {
    after,
    before,
    followingBlocks,
    heading: heading || null,
    nodeType: local.nodeType,
    precedingBlocks,
  }
}
