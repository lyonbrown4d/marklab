import { useEffect } from 'react'
import {
  DOUBLE_SHIFT_INITIAL_STATE,
  reduceDoubleShiftGesture,
  type DoubleShiftGestureAction,
} from '@/components/command/doubleShiftGesture'
import { isCommandPaletteBlockedByActiveSurface } from '@/app/nativeSurfaceOcclusion'

type UseDoubleShiftCommandPaletteArgs = {
  enabled: boolean
  onOpen: () => void
}

const isCommandPaletteUnavailable = () =>
  document.visibilityState === 'hidden' || isCommandPaletteBlockedByActiveSurface()

const keyboardAction = (
  type: 'keydown' | 'keyup',
  event: KeyboardEvent,
): DoubleShiftGestureAction => ({
  type,
  key: event.key,
  now: Date.now(),
  altKey: event.altKey,
  ctrlKey: event.ctrlKey,
  defaultPrevented: event.defaultPrevented,
  isComposing: event.isComposing,
  metaKey: event.metaKey,
  repeat: event.repeat,
})

export const useDoubleShiftCommandPalette = ({
  enabled,
  onOpen,
}: UseDoubleShiftCommandPaletteArgs) => {
  useEffect(() => {
    let state = DOUBLE_SHIFT_INITIAL_STATE
    if (!enabled) return

    const reset = () => {
      state = DOUBLE_SHIFT_INITIAL_STATE
    }
    const handleKey = (type: 'keydown' | 'keyup', event: KeyboardEvent) => {
      if (isCommandPaletteUnavailable()) {
        reset()
        return
      }
      const next = reduceDoubleShiftGesture(state, keyboardAction(type, event))
      state = next.state
      if (next.shouldOpen) onOpen()
    }
    const handleKeyDown = (event: KeyboardEvent) => handleKey('keydown', event)
    const handleKeyUp = (event: KeyboardEvent) => handleKey('keyup', event)

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup', handleKeyUp, { capture: true })
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup', handleKeyUp, { capture: true })
      window.removeEventListener('blur', reset)
    }
  }, [enabled, onOpen])
}
