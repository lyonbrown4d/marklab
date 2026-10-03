import type { Value } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { MarkdownEditorStatus } from '@/components/editor/markdownEditorTypes'
import { loadPlateMarkdown } from '@/services/plateMarkdownWorkerClient'

type UsePlateAsyncInitialValueOptions = {
  editor: PlateEditor
  enabled: boolean
  externalApplyRef?: RefObject<boolean>
  onStatusChange?: (status: MarkdownEditorStatus) => void
  value: string
}

const replacePlateEditorValue = (
  editor: PlateEditor,
  value: Value,
  externalApplyRef?: RefObject<boolean>,
) => {
  if (externalApplyRef) externalApplyRef.current = true
  try {
    editor.children = value
    editor.selection = null
    editor.operations = []
    editor.marks = null
    if (editor.history) {
      editor.history.undos = []
      editor.history.redos = []
    }
    editor.api.onChange()
  } finally {
    if (externalApplyRef) externalApplyRef.current = false
  }
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
  onStatusChange,
  value,
}: UsePlateAsyncInitialValueOptions) => {
  const latestConfigRef = useRef({ enabled, onStatusChange, value })
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
    if (!config.enabled) {
      setLoadState({ editor, ready: true, usesWorker: false })
      config.onStatusChange?.({ phase: 'ready' })
      return
    }
    const controller = new AbortController()
    setLoadState({ editor, ready: false, usesWorker: true })
    config.onStatusChange?.({ phase: 'loading' })
    void Promise.resolve(loadPlateMarkdown(editor, config.value, controller.signal)).then(
      (nextValue) => {
        if (controller.signal.aborted) return
        replacePlateEditorValue(editor, nextValue, externalApplyRef)
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
  }, [editor, externalApplyRef])

  if (loadState.editor !== editor) return false
  return !loadState.usesWorker || loadState.ready
}

type UsePlateExternalValueLoaderOptions = {
  editor: PlateEditor
  onError?: (error: Error) => void
}

export const usePlateExternalValueLoader = ({
  editor,
  onError,
}: UsePlateExternalValueLoaderOptions) => {
  const abortRef = useRef<AbortController | null>(null)
  const generationRef = useRef(0)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  const cancel = useCallback(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const load = useCallback(
    (markdown: string): Promise<Value | null> | Value | null => {
      cancel()
      const generation = generationRef.current
      const controller = new AbortController()
      abortRef.current = controller
      const accept = (value: Value) => {
        if (controller.signal.aborted || generation !== generationRef.current) return null
        abortRef.current = null
        return value
      }
      const reject = (error: unknown) => {
        if (controller.signal.aborted || generation !== generationRef.current) return null
        abortRef.current = null
        onErrorRef.current?.(error instanceof Error ? error : new Error('Markdown parse failed.'))
        return null
      }
      try {
        const result = loadPlateMarkdown(editor, markdown, controller.signal)
        return result instanceof Promise ? result.then(accept, reject) : accept(result)
      } catch (error) {
        return reject(error)
      }
    },
    [cancel, editor],
  )

  useEffect(() => cancel, [cancel, editor])

  return { cancel, load }
}

type UsePlateExternalValueSyncOptions = {
  cancelSnapshot: () => void
  changeRevisionRef: RefObject<number>
  composingRef: RefObject<boolean>
  editableRef: RefObject<HTMLDivElement | null>
  editor: PlateEditor
  externalApplyRef: RefObject<boolean>
  latestExternalValueRef: RefObject<string>
  localEchoRef: RefObject<string | null>
  onStatusChange?: (status: MarkdownEditorStatus) => void
  ready: boolean
  value: string
}

export const usePlateExternalValueSync = ({
  cancelSnapshot,
  changeRevisionRef,
  composingRef,
  editableRef,
  editor,
  externalApplyRef,
  latestExternalValueRef,
  localEchoRef,
  onStatusChange,
  ready,
  value,
}: UsePlateExternalValueSyncOptions) => {
  const pendingRef = useRef<null | { revision: number; value: string }>(null)
  const { cancel, load } = usePlateExternalValueLoader({
    editor,
    onError: (error) => onStatusChange?.({ message: error.message, phase: 'error' }),
  })

  const apply = useCallback(
    (nextValue: string, expectedRevision: number) => {
      onStatusChange?.({ phase: 'loading' })
      const applyParsedValue = (parsedValue: Value | null) => {
        if (!parsedValue) return
        if (changeRevisionRef.current !== expectedRevision) {
          onStatusChange?.({ phase: 'ready' })
          return
        }
        if (composingRef.current || editableRef.current === document.activeElement) {
          pendingRef.current = { revision: expectedRevision, value: nextValue }
          onStatusChange?.({ phase: 'ready' })
          return
        }
        cancelSnapshot()
        replacePlateEditorValue(editor, parsedValue, externalApplyRef)
        onStatusChange?.({ phase: 'ready' })
      }
      const result = load(nextValue)
      if (result instanceof Promise) void result.then(applyParsedValue)
      else applyParsedValue(result)
    },
    [
      cancelSnapshot,
      changeRevisionRef,
      composingRef,
      editableRef,
      editor,
      externalApplyRef,
      load,
      onStatusChange,
    ],
  )

  const applyPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return false
    pendingRef.current = null
    if (changeRevisionRef.current !== pending.revision) return false
    cancelSnapshot()
    apply(pending.value, pending.revision)
    return true
  }, [apply, cancelSnapshot, changeRevisionRef])

  useEffect(() => {
    if (!ready) return
    const previousExternalValue = latestExternalValueRef.current
    latestExternalValueRef.current = value
    if (localEchoRef.current === value) {
      localEchoRef.current = null
      cancel()
      return
    }
    if (previousExternalValue === value) {
      cancel()
      return
    }
    const revision = changeRevisionRef.current
    if (composingRef.current || editableRef.current === document.activeElement) {
      cancel()
      pendingRef.current = { revision, value }
      return
    }
    cancelSnapshot()
    apply(value, revision)
  }, [
    apply,
    cancel,
    cancelSnapshot,
    changeRevisionRef,
    composingRef,
    editableRef,
    latestExternalValueRef,
    localEchoRef,
    ready,
    value,
  ])

  return applyPending
}
