import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Plugin, type EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

type OnMarkdownDocumentChange = (document: ProseMirrorNode) => void

export const createMarkdownDocumentChangeView = (onDocumentChange: OnMarkdownDocumentChange) => ({
  update: (view: EditorView, previousState: EditorState) => {
    if (view.state.doc === previousState.doc) return
    onDocumentChange(view.state.doc)
  },
})

export const markdownDocumentChangePlugin = (onDocumentChange: OnMarkdownDocumentChange) =>
  $prose(
    () =>
      new Plugin({
        view: () => createMarkdownDocumentChangeView(onDocumentChange),
      }),
  )
