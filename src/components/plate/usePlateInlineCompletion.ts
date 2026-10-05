import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useKeepAliveContext } from 'keepalive-for-react'
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
  const routeCache = useKeepAliveContext()
  const routeActive = !routeCache.cacheKey || routeCache.active
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
  const syncFrameRef = useRef<number | null>(null)
  const scheduleSync = useCallback(() => {
    if (syncFrameRef.current !== null) cancelAnimationFrame(syncFrameRef.current)
    syncFrameRef.current = requestAnimationFrame(() => {
      syncFrameRef.current = null
      controller.sync()
    })
  }, [controller])

  useEffect(() => {
    return () => {
      if (syncFrameRef.current !== null) cancelAnimationFrame(syncFrameRef.current)
      controller.destroy()
    }
  }, [controller])

  useEffect(() => {
    if (!routeActive) {
      controller.deactivate()
      return
    }
    controller.activate()
    controller.sync()
  }, [controller, routeActive])

  useEffect(() => {
    if (routeActive) controller.sync()
  }, [controller, indexRevision, routeActive, syncKey])

  return useMemo(
    () => ({
      decorate: ({ entry }: { entry: Parameters<typeof controller.decorate>[0] }) =>
        controller.decorate(entry),
      onCompositionEnd: controller.compositionEnd,
      onCompositionStart: controller.compositionStart,
      onEditorChange: scheduleSync,
      onKeyDown: controller.keyDown,
      onSelectionChange: controller.sync,
      renderLeaf: PlateInlineCompletionLeaf,
      state,
    }),
    [controller, scheduleSync, state],
  )
}

export type PlateInlineCompletionBindings = ReturnType<typeof usePlateInlineCompletion>
export type { PlateEditor }
