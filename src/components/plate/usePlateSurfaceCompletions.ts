import { useMemoizedFn } from 'ahooks'
import type { PlateEditor } from 'platejs/react'
import { usePlateInlineCompletion } from '@/components/plate/usePlateInlineCompletion'
import { usePlateWorkspaceLinkCompletion } from '@/components/plate/workspaceLink/usePlateWorkspaceLinkCompletion'

type UsePlateSurfaceCompletionsOptions = {
  activePath: string | null
  editor: PlateEditor
  enabled: boolean
  getMarkdown: () => Promise<string>
  readOnly: boolean
  value: string
}

export const usePlateSurfaceCompletions = ({
  activePath,
  editor,
  enabled,
  getMarkdown,
  readOnly,
  value,
}: UsePlateSurfaceCompletionsOptions) => {
  const inline = usePlateInlineCompletion({
    activePath,
    editor,
    readOnly: readOnly || !enabled,
    value,
  })
  const workspaceLink = usePlateWorkspaceLinkCompletion({
    activePath,
    editor,
    enabled,
    getMarkdown,
    readOnly,
  })
  const decorate = useMemoizedFn(({ entry }: Parameters<typeof inline.decorate>[0]) => [
    ...inline.decorate({ entry }),
    ...workspaceLink.decorate({ entry }),
  ])

  return {
    decorate,
    onBlur: useMemoizedFn(() => {
      inline.onBlur()
      workspaceLink.onBlur()
    }),
    onCompositionEnd: useMemoizedFn(() => {
      inline.onCompositionEnd()
      workspaceLink.onCompositionEnd()
    }),
    onCompositionStart: useMemoizedFn(() => {
      inline.onCompositionStart()
      workspaceLink.onCompositionStart()
    }),
    onEditorChange: useMemoizedFn(() => {
      inline.onEditorChange()
      workspaceLink.onEditorChange()
    }),
    onKeyDown: useMemoizedFn(
      (event: KeyboardEvent) => workspaceLink.onKeyDown(event) || inline.onKeyDown(event),
    ),
    onSelectionChange: useMemoizedFn(() => {
      inline.onSelectionChange()
      workspaceLink.onSelectionChange()
    }),
    renderLeaf: inline.renderLeaf,
  }
}

export type PlateSurfaceCompletionBindings = ReturnType<typeof usePlateSurfaceCompletions>
