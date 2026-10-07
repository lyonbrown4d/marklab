import type { TNode } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { PlateInlineCompletionContext } from '@/components/plate/completion/plateInlineCompletionContext'
import {
  DocumentCompletionIndex,
  type DocumentCompletionBlock,
  type DocumentCompletionCandidate,
} from '@/logic/documentCompletionIndex'

type PlateOperation = {
  newPath?: number[]
  path?: number[]
  type: string
}

const STRUCTURAL_OPERATIONS = new Set([
  'insert_node',
  'merge_node',
  'move_node',
  'remove_node',
  'split_node',
])

const IGNORED_NODE_TYPES = new Set([
  'code_block',
  'codeBlock',
  'frontmatter',
  'front_matter',
  'table',
  'yaml',
])

const nodeType = (node: TNode): string => {
  const type = 'type' in node ? node.type : null
  return typeof type === 'string' ? type : ''
}

const blockKind = (node: TNode): DocumentCompletionBlock['kind'] => {
  const type = nodeType(node)
  if (IGNORED_NODE_TYPES.has(type) || type.startsWith('table_')) return 'ignored'
  if (/^h[1-6]$|^heading$/u.test(type)) return 'heading'
  if (/^(?:li|lic|list_item|task_list_item)$/u.test(type)) return 'list-item'
  return 'text'
}

const blockId = (node: TNode, index: number): string => {
  const id = 'id' in node ? node.id : null
  return typeof id === 'string' && id ? id : `block:${index}`
}

const readBlock = (editor: PlateEditor, index: number): DocumentCompletionBlock | null => {
  const node = editor.children[index]
  if (!node) return null
  return {
    id: blockId(node, index),
    kind: blockKind(node),
    order: index,
    text: editor.api.string([index]),
  }
}

const readBlocks = (editor: PlateEditor): DocumentCompletionBlock[] =>
  editor.children.flatMap((_node, index) => {
    const block = readBlock(editor, index)
    return block ? [block] : []
  })

const currentBlockIds = (editor: PlateEditor): string[] =>
  editor.children.map((node, index) => blockId(node, index))

const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index])

export type PlateDocumentCompletionIndex = {
  destroy: () => void
  hydrate: () => void
  query: (context: PlateInlineCompletionContext) => readonly DocumentCompletionCandidate[]
  syncEditorChanges: () => void
}

export const createPlateDocumentCompletionIndex = (
  editor: PlateEditor,
  index = new DocumentCompletionIndex(),
): PlateDocumentCompletionIndex => {
  let blockIds: string[] = []
  let version = 0

  const hydrate = () => {
    const blocks = readBlocks(editor)
    blockIds = blocks.map(({ id }) => id)
    version += 1
    index.replaceBlocks(blocks, version)
  }

  const syncEditorChanges = () => {
    const operations = editor.operations as PlateOperation[]
    const nextIds = currentBlockIds(editor)
    if (
      operations.some(({ type }) => STRUCTURAL_OPERATIONS.has(type)) ||
      !sameIds(blockIds, nextIds)
    ) {
      hydrate()
      return
    }

    const changed = new Set<number>()
    for (const operation of operations) {
      const index = operation.path?.[0]
      const nextIndex = operation.newPath?.[0]
      if (index !== undefined) changed.add(index)
      if (nextIndex !== undefined) changed.add(nextIndex)
    }
    const activeIndex = editor.selection?.focus.path[0]
    if (changed.size === 0 && activeIndex !== undefined) changed.add(activeIndex)
    const updates = [...changed].flatMap((changedIndex) => {
      const block = readBlock(editor, changedIndex)
      return block ? [{ block, type: 'upsert' as const }] : []
    })
    if (updates.length === 0) return
    version += 1
    index.applyBlockBatch(updates, version)
  }

  return {
    destroy: () => index.destroy(),
    hydrate,
    query: (context) =>
      index.query(context.before, undefined, {
        blockId: context.blockId,
        blockOffset: context.blockOffset,
      }),
    syncEditorChanges,
  }
}
