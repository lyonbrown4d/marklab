import { useLayoutEffect, type RefObject } from 'react'
import type { Crepe } from '@milkdown/crepe'
import {
  readPlaygroundMarkdown,
  replaceMarkdownLikePlayground,
} from '@/components/milkdown/markdownPlaygroundActions'
import type {
  MarkdownEditorProps,
  ThrottledMarkdownUpdate,
} from '@/components/milkdown/markdownEditorTypes'

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
  onCalendarFileCreateRef: RefObject<MarkdownEditorProps['onCalendarFileCreate']>
  onChangeRef: RefObject<MarkdownEditorProps['onChange']>
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
  onCalendarFileCreate,
  onCalendarFileCreateRef,
  onChange,
  onChangeRef,
  throttledMarkdownUpdateRef,
  value,
}: UseMarkdownPlaygroundSyncOptions) => {
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
    markdownSnapshotSchedulerRef.current?.flush()
    throttledMarkdownUpdateRef.current?.flush()
    const documentChanged = activePathRef.current !== activePath
    const valueChanged =
      latestValuePathRef.current !== activePath || latestValueRef.current !== value
    applyingExternalValueRef.current = true
    try {
      activePathRef.current = activePath
      latestValuePathRef.current = activePath
      latestValueRef.current = value
      const crepe = crepeRef.current
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
    latestValuePathRef,
    latestValueRef,
    markdownSnapshotSchedulerRef,
    throttledMarkdownUpdateRef,
    value,
  ])
}
