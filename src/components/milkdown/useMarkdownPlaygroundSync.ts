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
import type { PendingExternalValue } from '@/components/milkdown/editorActions'

type UseMarkdownPlaygroundSyncOptions = Pick<
  MarkdownEditorProps,
  'activePath' | 'onCalendarFileCreate' | 'onChange' | 'value'
> & {
  activePathListenersRef: RefObject<Set<() => void>>
  activePathRef: RefObject<string | null>
  applyingExternalValueRef: RefObject<boolean>
  crepeRef: RefObject<Crepe | null>
  latestValuePathRef: RefObject<string | null>
  latestValueRef: RefObject<string>
  markdownSnapshotSchedulerRef: RefObject<{ flush: () => void } | null>
  isComposingRef: RefObject<boolean>
  onCalendarFileCreateRef: RefObject<MarkdownEditorProps['onCalendarFileCreate']>
  onChangeRef: RefObject<MarkdownEditorProps['onChange']>
  pendingExternalValueRef: RefObject<PendingExternalValue | null>
  rootRef: RefObject<HTMLDivElement | null>
  throttledMarkdownUpdateRef: RefObject<ThrottledMarkdownUpdate | null>
}

export const useMarkdownPlaygroundSync = ({
  activePath,
  activePathListenersRef,
  activePathRef,
  applyingExternalValueRef,
  crepeRef,
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
  const compositionBaseValueRef = useRef<string | null>(null)

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
        baseValue:
          compositionBaseValueRef.current ?? readPlaygroundMarkdown(crepe, latestValueRef.current),
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
      const crepe = crepeRef.current
      compositionBaseValueRef.current = crepe
        ? readPlaygroundMarkdown(crepe, latestValueRef.current)
        : latestValueRef.current
    }
    const handleCompositionEnd = () => {
      isComposingRef.current = false
      compositionBaseValueRef.current = null
      queueMicrotask(() => {
        markdownSnapshotSchedulerRef.current?.flush()
        throttledMarkdownUpdateRef.current?.flush()
        const pending = pendingExternalValueRef.current
        pendingExternalValueRef.current = null
        const crepe = crepeRef.current
        if (!pending || pending.path !== activePathRef.current || !crepe) return
        if (readPlaygroundMarkdown(crepe, latestValueRef.current) !== pending.baseValue) return

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
    root.addEventListener('compositionend', handleCompositionEnd)
    return () => {
      root.removeEventListener('compositionstart', handleCompositionStart)
      root.removeEventListener('compositionend', handleCompositionEnd)
    }
  }, [
    activePathRef,
    applyingExternalValueRef,
    crepeRef,
    isComposingRef,
    latestValuePathRef,
    latestValueRef,
    markdownSnapshotSchedulerRef,
    pendingExternalValueRef,
    rootRef,
    throttledMarkdownUpdateRef,
  ])
}
