import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { MarkdownEditorStatus } from '@/components/editor/markdownEditorTypes'
import { usePlateExternalValueLoader } from '@/components/plate/usePlateExternalValueLoader'

const normalizeError = (error: unknown) =>
  error instanceof Error ? error : new Error('Markdown parse failed.')

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
  readOnly: boolean
  ready: boolean
  value: string
}

type PendingExternalValue = { previousValue: string; revision: number; value: string }

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
  readOnly,
  ready,
  value,
}: UsePlateExternalValueSyncOptions) => {
  const pendingRef = useRef<PendingExternalValue | null>(null)
  const applicationRef = useRef(0)
  const inFlightValueRef = useRef<string | null>(null)
  const stableExternalValueRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { cancel, load } = usePlateExternalValueLoader({ editor, externalApplyRef })

  const stop = useCallback(
    (reportReady: boolean) => {
      applicationRef.current += 1
      cancel()
      inFlightValueRef.current = null
      stableExternalValueRef.current = null
      setLoading(false)
      if (reportReady) onStatusChange?.({ phase: 'ready' })
    },
    [cancel, onStatusChange],
  )

  const apply = useCallback(
    (nextValue: string, expectedRevision: number, previousValue: string) => {
      const application = applicationRef.current + 1
      applicationRef.current = application
      inFlightValueRef.current = nextValue
      stableExternalValueRef.current ??= previousValue
      cancelSnapshot()
      setLoading(true)
      onStatusChange?.({ phase: 'loading' })
      const canApply = () =>
        changeRevisionRef.current === expectedRevision &&
        !composingRef.current &&
        (readOnly || editableRef.current !== document.activeElement)

      void load(nextValue, canApply).then(
        (applied) => {
          if (application !== applicationRef.current) return
          if (!applied) {
            const stableValue = stableExternalValueRef.current ?? previousValue
            latestExternalValueRef.current = stableValue
            if (changeRevisionRef.current === expectedRevision) {
              pendingRef.current = {
                previousValue: stableValue,
                revision: expectedRevision,
                value: nextValue,
              }
            }
          } else if (applied) {
            latestExternalValueRef.current = nextValue
            stableExternalValueRef.current = null
          }
          inFlightValueRef.current = null
          setLoading(false)
          onStatusChange?.({ phase: 'ready' })
        },
        (error: unknown) => {
          if (application !== applicationRef.current) return
          const stableValue = stableExternalValueRef.current ?? previousValue
          latestExternalValueRef.current = stableValue
          if (changeRevisionRef.current === expectedRevision) {
            pendingRef.current = {
              previousValue: stableValue,
              revision: expectedRevision,
              value: nextValue,
            }
          }
          inFlightValueRef.current = null
          setLoading(false)
          onStatusChange?.({ message: normalizeError(error).message, phase: 'error' })
        },
      )
    },
    [
      cancelSnapshot,
      changeRevisionRef,
      composingRef,
      editableRef,
      load,
      latestExternalValueRef,
      onStatusChange,
      readOnly,
    ],
  )

  const applyPending = useCallback(() => {
    const pending = pendingRef.current
    if (!pending) return false
    pendingRef.current = null
    if (changeRevisionRef.current !== pending.revision) return false
    apply(pending.value, pending.revision, pending.previousValue)
    return true
  }, [apply, changeRevisionRef])

  useEffect(() => {
    if (!ready) return
    const previousExternalValue = latestExternalValueRef.current
    const stablePreviousValue = pendingRef.current?.previousValue ?? previousExternalValue
    if (localEchoRef.current === value) {
      latestExternalValueRef.current = value
      localEchoRef.current = null
      pendingRef.current = null
      inFlightValueRef.current = null
      stableExternalValueRef.current = null
      stop(loading)
      return
    }
    if (pendingRef.current?.value === value) return
    if (inFlightValueRef.current === value) return
    if (previousExternalValue === value) {
      if (pendingRef.current?.value !== value) pendingRef.current = null
      if (inFlightValueRef.current && inFlightValueRef.current !== value) stop(loading)
      return
    }
    const revision = changeRevisionRef.current
    if (composingRef.current || (!readOnly && editableRef.current === document.activeElement)) {
      pendingRef.current = { previousValue: stablePreviousValue, revision, value }
      stop(loading)
      return
    }
    pendingRef.current = null
    apply(value, revision, stablePreviousValue)
  }, [
    apply,
    changeRevisionRef,
    composingRef,
    editableRef,
    editor,
    latestExternalValueRef,
    loading,
    localEchoRef,
    readOnly,
    ready,
    stop,
    value,
  ])

  useEffect(() => {
    return () => {
      applicationRef.current += 1
      pendingRef.current = null
      inFlightValueRef.current = null
      stableExternalValueRef.current = null
      cancel()
    }
  }, [cancel, editor])

  return { applyPending, loading }
}
