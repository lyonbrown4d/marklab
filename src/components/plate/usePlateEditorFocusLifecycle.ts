import type { PlateEditor } from 'platejs/react'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import {
  clearPlateFocusMode,
  EMPTY_PLATE_FOCUS_STATE,
  syncPlateFocusMode,
  type PlateFocusState,
} from '@/components/plate/plateFocusMode'
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
  const focusStateRef = useRef<PlateFocusState>(EMPTY_PLATE_FOCUS_STATE)
  const focusSuppressedRef = useRef(false)

  usePlateAnimatedCursor({
    editableRef,
    enabled: interactionActive && !readOnly && contentReady,
  })

  useEffect(() => {
    if (interactionActive && autoFocus && !readOnly && contentReady) editableRef.current?.focus()
  }, [autoFocus, contentReady, editableRef, editor, interactionActive, readOnly])

  const syncActiveFocusBlock = useCallback(() => {
    if (!interactionActive || focusSuppressedRef.current) {
      clearPlateFocusMode(editableRef.current, focusStateRef.current)
      focusStateRef.current = EMPTY_PLATE_FOCUS_STATE
      return
    }
    focusStateRef.current = syncPlateFocusMode(editor, editableRef.current, focusStateRef.current)
  }, [editableRef, editor, interactionActive])

  useEffect(() => {
    const editable = editableRef.current
    syncActiveFocusBlock()
    if (!editable) return

    let blurTimer: number | null = null
    const handleFocusIn = () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer)
      focusSuppressedRef.current = false
      syncActiveFocusBlock()
    }
    const handleFocusOut = () => {
      blurTimer = window.setTimeout(() => {
        if (editable.contains(document.activeElement)) return
        focusSuppressedRef.current = true
        clearPlateFocusMode(editable, focusStateRef.current)
        focusStateRef.current = EMPTY_PLATE_FOCUS_STATE
      }, 0)
    }

    editable.addEventListener('focusin', handleFocusIn)
    editable.addEventListener('focusout', handleFocusOut)
    return () => {
      if (blurTimer !== null) window.clearTimeout(blurTimer)
      editable.removeEventListener('focusin', handleFocusIn)
      editable.removeEventListener('focusout', handleFocusOut)
      clearPlateFocusMode(editable, focusStateRef.current)
      focusStateRef.current = EMPTY_PLATE_FOCUS_STATE
    }
  }, [className, contentReady, editableRef, syncActiveFocusBlock])

  return syncActiveFocusBlock
}
