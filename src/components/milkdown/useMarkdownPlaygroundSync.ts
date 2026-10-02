import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { Crepe } from '@milkdown/crepe'
import {
  readPlaygroundMarkdown,
  replaceMarkdownLikePlayground,
} from '@/components/milkdown/markdownPlaygroundActions'
import type {
  MarkdownEditorProps,
  ThrottledMarkdownUpdate,
} from '@/components/milkdown/markdownEditorTypes'
import type { PendingRevisionExternalValue } from '@/components/milkdown/editorActions'

type UseMarkdownPlaygroundSyncOptions = Pick<
  MarkdownEditorProps,
  'activePath' | 'onCalendarFileCreate' | 'onChange' | 'value'
> & {
  activePathListenersRef: RefObject<Set<() => void>>
  activePathRef: RefObject<string | null>
  applyingExternalValueRef: RefObject<boolean>
  crepeRef: RefObject<Crepe | null>
  documentRevisionRef: RefObject<number>
  latestValuePathRef: RefObject<string | null>
  latestValueRef: RefObject<string>
  markdownSnapshotSchedulerRef: RefObject<{ flush: () => void } | null>
  isComposingRef: RefObject<boolean>
  onCalendarFileCreateRef: RefObject<MarkdownEditorProps['onCalendarFileCreate']>
  onChangeRef: RefObject<MarkdownEditorProps['onChange']>
  pendingExternalValueRef: RefObject<PendingRevisionExternalValue | null>
  rootRef: RefObject<HTMLDivElement | null>
  throttledMarkdownUpdateRef: RefObject<ThrottledMarkdownUpdate | null>
}

export const useMarkdownPlaygroundSync = ({
  activePath,
  activePathListenersRef,
  activePathRef,
  applyingExternalValueRef,
  crepeRef,
  documentRevisionRef,
  latestValuePathRef,
  latestValueRef,
  markdownSnapshotSchedulerRef,
  isComposingRef,
  onCalendarFileCreate,
  onCalendarFileCreateRef,
  onChange,
  onChangeRef,
  pendingExternalValueRef,
  rootRef,
  throttledMarkdownUpdateRef,
  value,
}: UseMarkdownPlaygroundSyncOptions) => {
  const compositionBaseRevisionRef = useRef(0)
  const compositionChangedRef = useRef(false)

  useLayoutEffect(() => {
    if (onChangeRef.current === onChange) return
    markdownSnapshotSchedulerRef.current?.flush()
    throttledMarkdownUpdateRef.current?.flush()
    onChangeRef.current = onChange
  }, [markdownSnapshotSchedulerRef, onChange, onChangeRef, throttledMarkdownUpdateRef])

  useLayoutEffect(() => {
    onCalendarFileCreateRef.current = onCalendarFileCreate
  }, [onCalendarFileCreate, onCalendarFileCreateRef])

  useLayoutEffect(() => {
    const documentChanged = activePathRef.current !== activePath
    const valueChanged =
      latestValuePathRef.current !== activePath || latestValueRef.current !== value
    const crepe = crepeRef.current

    if (!documentChanged && valueChanged && crepe && isComposingRef.current) {
      pendingExternalValueRef.current = {
        baseRevision: compositionBaseRevisionRef.current,
        path: activePath,
        value,
      }
      return
    }

    markdownSnapshotSchedulerRef.current?.flush()
    throttledMarkdownUpdateRef.current?.flush()
    pendingExternalValueRef.current = null
    applyingExternalValueRef.current = true
    try {
      activePathRef.current = activePath
      latestValuePathRef.current = activePath
      latestValueRef.current = value
      if (crepe && valueChanged) {
        replaceMarkdownLikePlayground(crepe, value)
        latestValueRef.current = readPlaygroundMarkdown(crepe, value)
      }
      if (documentChanged) activePathListenersRef.current.forEach((listener) => listener())
    } finally {
      applyingExternalValueRef.current = false
    }
  }, [
    activePath,
    activePathListenersRef,
    activePathRef,
    applyingExternalValueRef,
    crepeRef,
    isComposingRef,
    latestValuePathRef,
    latestValueRef,
    markdownSnapshotSchedulerRef,
    pendingExternalValueRef,
    throttledMarkdownUpdateRef,
    value,
  ])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const handleCompositionStart = () => {
      isComposingRef.current = true
      compositionChangedRef.current = false
      compositionBaseRevisionRef.current = documentRevisionRef.current
    }
    const handleCompositionUpdate = () => {
      compositionChangedRef.current = true
    }
    const handleCompositionEnd = () => {
      isComposingRef.current = false
      const compositionChanged = compositionChangedRef.current
      compositionChangedRef.current = false
      queueMicrotask(() => {
        const pending = pendingExternalValueRef.current
        pendingExternalValueRef.current = null
        const crepe = crepeRef.current
        if (!pending || pending.path !== activePathRef.current || !crepe) return
        if (compositionChanged || documentRevisionRef.current !== pending.baseRevision) return

        applyingExternalValueRef.current = true
        try {
          latestValuePathRef.current = pending.path
          latestValueRef.current = pending.value
          replaceMarkdownLikePlayground(crepe, pending.value)
        } finally {
          applyingExternalValueRef.current = false
        }
      })
    }

    root.addEventListener('compositionstart', handleCompositionStart)
    root.addEventListener('compositionupdate', handleCompositionUpdate)
    root.addEventListener('compositionend', handleCompositionEnd)
    return () => {
      root.removeEventListener('compositionstart', handleCompositionStart)
      root.removeEventListener('compositionupdate', handleCompositionUpdate)
      root.removeEventListener('compositionend', handleCompositionEnd)
    }
  }, [
    activePathRef,
    applyingExternalValueRef,
    crepeRef,
    documentRevisionRef,
    isComposingRef,
    latestValuePathRef,
    latestValueRef,
    pendingExternalValueRef,
    rootRef,
  ])
}
