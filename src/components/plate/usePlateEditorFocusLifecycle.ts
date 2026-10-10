import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { syncPlateFocusActiveBlock } from '@/components/plate/plateFocusMode'
import { usePlateAnimatedCursor } from '@/components/plate/usePlateAnimatedCursor'

type UsePlateEditorFocusLifecycleOptions = {
  autoFocus?: boolean
  className?: string
  contentReady: boolean
  editableRef: RefObject<HTMLDivElement | null>
  editor: PlateEditor
  interactionActive: boolean
  readOnly: boolean
}

export const usePlateEditorFocusLifecycle = ({
  autoFocus,
  className,
  contentReady,
  editableRef,
  editor,
  interactionActive,
  readOnly,
}: UsePlateEditorFocusLifecycleOptions) => {
  const activeFocusBlockRef = useRef<HTMLElement | null>(null)

  usePlateAnimatedCursor({
    editableRef,
    enabled: interactionActive && !readOnly && contentReady,
  })

  useEffect(() => {
    if (interactionActive && autoFocus && !readOnly && contentReady) editableRef.current?.focus()
  }, [autoFocus, contentReady, editableRef, editor, interactionActive, readOnly])

  const syncActiveFocusBlock = useCallback(() => {
    if (!interactionActive) {
      activeFocusBlockRef.current?.removeAttribute('data-focus-active')
      editableRef.current?.removeAttribute('data-focus-active')
      activeFocusBlockRef.current = null
      return
    }
    activeFocusBlockRef.current = syncPlateFocusActiveBlock(
      editor,
      editableRef.current,
      activeFocusBlockRef.current,
    )
  }, [editableRef, editor, interactionActive])

  useEffect(() => {
    const editable = editableRef.current
    syncActiveFocusBlock()
    return () => {
      activeFocusBlockRef.current?.removeAttribute('data-focus-active')
      editable?.removeAttribute('data-focus-active')
      activeFocusBlockRef.current = null
    }
  }, [className, contentReady, editableRef, syncActiveFocusBlock])

  return syncActiveFocusBlock
}
