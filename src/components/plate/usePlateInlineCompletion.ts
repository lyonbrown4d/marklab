import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { PlateEditor } from 'platejs/react'
import { PlateInlineCompletionLeaf } from '@/components/plate/completion/PlateInlineCompletionLeaf'
import { createPlateInlineCompletionController } from '@/components/plate/completion/plateInlineCompletionController'
import type { UsePlateInlineCompletionOptions } from '@/components/plate/completion/types'
import { usePlateInlineCompletionOptions } from '@/components/plate/completion/usePlateInlineCompletionOptions'

export const usePlateInlineCompletion = ({
  activePath,
  editor,
  readOnly,
  value,
}: UsePlateInlineCompletionOptions) => {
  const { indexRevision, options, syncKey } = usePlateInlineCompletionOptions({
    activePath,
    readOnly,
    value,
  })
  const controller = useMemo(
    () => createPlateInlineCompletionController(editor, options),
    [editor, options],
  )
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  useEffect(() => {
    controller.activate()
    return controller.destroy
  }, [controller])

  useEffect(() => controller.sync(), [controller, indexRevision, syncKey])

  return useMemo(
    () => ({
      decorate: ({ entry }: { entry: Parameters<typeof controller.decorate>[0] }) =>
        controller.decorate(entry),
      onCompositionEnd: controller.compositionEnd,
      onCompositionStart: controller.compositionStart,
      onEditorChange: controller.sync,
      onKeyDown: controller.keyDown,
      onSelectionChange: controller.sync,
      renderLeaf: PlateInlineCompletionLeaf,
      state,
    }),
    [controller, state],
  )
}

export type PlateInlineCompletionBindings = ReturnType<typeof usePlateInlineCompletion>
export type { PlateEditor }
