import type { PlateEditor } from 'platejs/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import type { MarkdownEditorStatus } from '@/components/editor/markdownEditorTypes'
import {
  appendPlateEditorValue,
  replacePlateEditorValue,
  resetPlateEditorHydrationState,
  splitPlateHydrationChunk,
  yieldToPlateHydrationTask,
} from '@/components/plate/plateEditorValueHydration'
import { loadPlateMarkdown, streamPlateMarkdown } from '@/services/plateMarkdownWorkerClient'

type UsePlateAsyncInitialValueOptions = {
  editor: PlateEditor
  enabled: boolean
  externalApplyRef?: RefObject<boolean>
  latestExternalValueRef?: RefObject<string>
  onStatusChange?: (status: MarkdownEditorStatus) => void
  value: string
}

type InitialLoadState = {
  editor: PlateEditor
  ready: boolean
  usesWorker: boolean
}

export const usePlateAsyncInitialValue = ({
  editor,
  enabled,
  externalApplyRef,
  latestExternalValueRef,
  onStatusChange,
  value,
}: UsePlateAsyncInitialValueOptions) => {
  const latestConfigRef = useRef({ enabled, onStatusChange, value })
  const hydratedEditorRef = useRef<PlateEditor | null>(null)
  const hydratingEditorRef = useRef<PlateEditor | null>(null)
  const [loadState, setLoadState] = useState<InitialLoadState>({
    editor,
    ready: !enabled,
    usesWorker: enabled,
  })

  useEffect(() => {
    latestConfigRef.current = { enabled, onStatusChange, value }
  }, [enabled, onStatusChange, value])

  useEffect(() => {
    const config = latestConfigRef.current
    if (hydratedEditorRef.current === editor) return
    if (!config.enabled) {
      if (hydratingEditorRef.current === editor) {
        const nextValue = loadPlateMarkdown(editor, config.value)
        if (!(nextValue instanceof Promise)) {
          replacePlateEditorValue(editor, nextValue, externalApplyRef)
        }
      }
      hydratedEditorRef.current = editor
      if (latestExternalValueRef) latestExternalValueRef.current = config.value
      setLoadState({ editor, ready: true, usesWorker: false })
      config.onStatusChange?.({ phase: 'ready' })
      return
    }
    const controller = new AbortController()
    hydratingEditorRef.current = editor
    let firstChunk = true
    resetPlateEditorHydrationState(editor)
    setLoadState({ editor, ready: false, usesWorker: true })
    config.onStatusChange?.({ phase: 'loading' })
    void streamPlateMarkdown(
      editor,
      config.value,
      async (chunk) => {
        for (const rendererChunk of splitPlateHydrationChunk(chunk)) {
          if (controller.signal.aborted) return
          appendPlateEditorValue(editor, rendererChunk, firstChunk, externalApplyRef)
          firstChunk = false
          await yieldToPlateHydrationTask()
        }
      },
      controller.signal,
    ).then(
      () => {
        if (controller.signal.aborted) return
        resetPlateEditorHydrationState(editor)
        hydratedEditorRef.current = editor
        hydratingEditorRef.current = null
        if (latestExternalValueRef) latestExternalValueRef.current = config.value
        setLoadState({ editor, ready: true, usesWorker: true })
        config.onStatusChange?.({ phase: 'ready' })
      },
      (error: unknown) => {
        if (controller.signal.aborted) return
        config.onStatusChange?.({
          message: error instanceof Error ? error.message : 'Markdown parse failed.',
          phase: 'error',
        })
      },
    )
    return () => controller.abort()
  }, [editor, enabled, externalApplyRef, latestExternalValueRef, value])

  if (loadState.editor !== editor) return false
  return !loadState.usesWorker || loadState.ready
}
