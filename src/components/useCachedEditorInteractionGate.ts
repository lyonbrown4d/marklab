import { useCallback, useLayoutEffect, useRef } from 'react'

export const useCachedEditorInteractionGate = (interactionActive: boolean) => {
  const acceptingChangesRef = useRef(interactionActive)

  useLayoutEffect(() => {
    if (!interactionActive) {
      acceptingChangesRef.current = false
      return
    }

    const frame = window.requestAnimationFrame(() => {
      acceptingChangesRef.current = true
    })
    return () => window.cancelAnimationFrame(frame)
  }, [interactionActive])

  return useCallback(() => interactionActive && acceptingChangesRef.current, [interactionActive])
}
