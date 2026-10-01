import { useCallback, type RefObject } from 'react'
import type { Crepe } from '@milkdown/crepe'
import { editorViewCtx } from '@milkdown/kit/core'
import type { EditorView } from '@milkdown/kit/prose/view'

type UseMarkdownEditorAccessOptions = {
  crepeRef: RefObject<Crepe | null>
  latestValueRef: RefObject<string>
}

export const useMarkdownEditorAccess = ({
  crepeRef,
  latestValueRef,
}: UseMarkdownEditorAccessOptions) => {
  const focusEditor = useCallback(() => {
    crepeRef.current?.editor.action((ctx) => ctx.get(editorViewCtx).focus())
  }, [crepeRef])
  const getMarkdown = useCallback(
    () => crepeRef.current?.getMarkdown() ?? latestValueRef.current,
    [crepeRef, latestValueRef],
  )
  const getEditorView = useCallback(
    (): EditorView | null =>
      crepeRef.current?.editor.action((ctx) => ctx.get(editorViewCtx)) ?? null,
    [crepeRef],
  )
  return { focusEditor, getEditorView, getMarkdown }
}
