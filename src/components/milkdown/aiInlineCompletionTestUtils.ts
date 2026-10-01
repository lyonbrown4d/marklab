import { history } from '@milkdown/kit/prose/history'
import { Schema, type Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection, type Plugin } from '@milkdown/kit/prose/state'
import { EditorView } from '@milkdown/kit/prose/view'
import { vi } from 'vitest'

export const inlineCompletionTestSchema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      attrs: { level: { default: 1 } },
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'h1' }],
      toDOM: () => ['h1', 0],
    },
    code_block: {
      code: true,
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'pre' }],
      toDOM: () => ['pre', ['code', 0]],
    },
    table: { content: 'table_row+', group: 'block', toDOM: () => ['table', ['tbody', 0]] },
    table_row: { content: 'table_cell+', toDOM: () => ['tr', 0] },
    table_cell: { content: 'paragraph+', toDOM: () => ['td', 0] },
    text: { group: 'inline' },
  },
})

export const testParagraph = (text: string) =>
  inlineCompletionTestSchema.node(
    'paragraph',
    null,
    text ? inlineCompletionTestSchema.text(text) : undefined,
  )

export const createInlineCompletionTestView = (
  plugins: readonly Plugin[],
  doc: ProseMirrorNode = inlineCompletionTestSchema.node('doc', null, [testParagraph('I plan')]),
  editable = true,
) => {
  const root = document.createElement('div')
  document.body.append(root)
  const state = EditorState.create({
    doc,
    plugins: [history(), ...plugins],
    selection: TextSelection.atEnd(doc),
  })
  const view = new EditorView(root, {
    editable: () => editable,
    state,
    dispatchTransaction: (transaction) => view.updateState(view.state.apply(transaction)),
  })
  return { root, view }
}

export const pressInlineCompletionKey = (
  view: EditorView,
  key: string,
  modifiers: Pick<KeyboardEventInit, 'altKey' | 'ctrlKey' | 'metaKey'> = {},
) =>
  Boolean(
    view.someProp('handleKeyDown', (handler) =>
      handler(view, new KeyboardEvent('keydown', { key, ...modifiers })),
    ),
  )

export const settleInlineCompletion = async (debounceMs = 20) => {
  await vi.advanceTimersByTimeAsync(debounceMs)
  await Promise.resolve()
}
