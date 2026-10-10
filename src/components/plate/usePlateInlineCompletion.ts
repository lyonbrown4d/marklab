import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { useKeepAliveContext } from 'keepalive-for-react'
import type { PlateEditor } from 'platejs/react'
import { PointApi, type Point } from 'platejs'
import { PlateInlineCompletionLeaf } from '@/components/plate/completion/PlateInlineCompletionLeaf'
import { createPlateInlineCompletionController } from '@/components/plate/completion/plateInlineCompletionController'
import type { UsePlateInlineCompletionOptions } from '@/components/plate/completion/types'
import { usePlateInlineCompletionOptions } from '@/components/plate/completion/usePlateInlineCompletionOptions'

const INPUT_IDLE_MS = 300

export const usePlateInlineCompletion = ({
  activePath,
  editor,
  readOnly,
  value,
}: UsePlateInlineCompletionOptions) => {
  const routeCache = useKeepAliveContext()
  const routeActive = !routeCache.cacheKey || routeCache.active
  const { indexRevision, options, syncDocumentIndex, syncKey } = usePlateInlineCompletionOptions({
    activePath,
    editor,
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
  useEffect(() => editor.api.redecorate(), [editor, state])
  const syncFrameRef = useRef<number | null>(null)
  const inputTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputAnchorRef = useRef<Point | null>(null)
  const dismiss = useCallback(() => {
    if (syncFrameRef.current !== null) cancelAnimationFrame(syncFrameRef.current)
    if (inputTimerRef.current !== null) clearTimeout(inputTimerRef.current)
    syncFrameRef.current = null
    inputTimerRef.current = null
    inputAnchorRef.current = null
    controller.dismiss()
  }, [controller])
  const scheduleSync = useCallback(() => {
    dismiss()
    inputAnchorRef.current = editor.selection ? { ...editor.selection.focus } : null
    syncDocumentIndex()
    syncFrameRef.current = requestAnimationFrame(() => {
      syncFrameRef.current = null
      inputTimerRef.current = setTimeout(() => {
        inputTimerRef.current = null
        controller.sync()
      }, INPUT_IDLE_MS)
    })
  }, [controller, dismiss, editor, syncDocumentIndex])
  const handleSelectionChange = useCallback(() => {
    const anchor = inputAnchorRef.current
    const selection = editor.selection
    if (
      !anchor ||
      !selection ||
      !PointApi.equals(anchor, selection.anchor) ||
      !PointApi.equals(anchor, selection.focus)
    ) {
      dismiss()
    }
  }, [dismiss, editor])

  useEffect(() => {
    return () => {
      dismiss()
      controller.destroy()
    }
  }, [controller, dismiss])

  useEffect(() => {
    if (!routeActive) {
      dismiss()
      controller.deactivate()
      return
    }
    controller.activate()
  }, [controller, dismiss, routeActive])

  useEffect(() => {
    dismiss()
  }, [dismiss, syncKey])

  useEffect(() => {
    if (
      routeActive &&
      inputAnchorRef.current &&
      inputTimerRef.current === null &&
      syncFrameRef.current === null
    ) {
      controller.sync()
    }
  }, [controller, indexRevision, routeActive])

  return useMemo(
    () => ({
      decorate: ({ entry }: { entry: Parameters<typeof controller.decorate>[0] }) =>
        controller.decorate(entry),
      onBlur: dismiss,
      onCompositionEnd: () => {
        controller.compositionEnd(false)
        scheduleSync()
      },
      onCompositionStart: () => {
        dismiss()
        controller.compositionStart()
      },
      onEditorChange: scheduleSync,
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key === 'Escape' && inputAnchorRef.current && !event.isComposing) {
          event.preventDefault()
          dismiss()
          return true
        }
        return controller.keyDown(event)
      },
      onSelectionChange: handleSelectionChange,
      renderLeaf: PlateInlineCompletionLeaf,
      state,
    }),
    [controller, dismiss, handleSelectionChange, scheduleSync, state],
  )
}

export type PlateInlineCompletionBindings = ReturnType<typeof usePlateInlineCompletion>
export type { PlateEditor }
