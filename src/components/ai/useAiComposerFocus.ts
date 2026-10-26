import { useEffect, useRef } from 'react'
import { isImeKeyboardEvent } from '@/logic/ime'

type AiComposerFocusOptions = {
  inputDisabled: boolean
  onDismiss: () => void
  pending: boolean
}

export const useAiComposerFocus = ({
  inputDisabled,
  onDismiss,
  pending,
}: AiComposerFocusOptions) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const stopRef = useRef<HTMLButtonElement>(null)
  const handledEscapeRef = useRef<KeyboardEvent | null>(null)

  useEffect(() => {
    if (pending) stopRef.current?.focus()
    else if (!inputDisabled) inputRef.current?.focus()
  }, [inputDisabled, pending])

  const dismissOnEscape = (event: KeyboardEvent) => {
    if (isImeKeyboardEvent(event) || handledEscapeRef.current === event) return
    handledEscapeRef.current = event
    onDismiss()
  }

  return { dismissOnEscape, inputRef, stopRef }
}
