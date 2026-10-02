import { useCallback, useRef } from 'react'

export const useMarkdownDocumentPathBridge = (initialPath: string | null) => {
  const activePathRef = useRef(initialPath)
  const activePathListenersRef = useRef(new Set<() => void>())
  const getDocumentPath = useCallback(() => activePathRef.current, [])
  const subscribeDocumentPath = useCallback((listener: () => void) => {
    activePathListenersRef.current.add(listener)
    return () => {
      activePathListenersRef.current.delete(listener)
    }
  }, [])

  return {
    activePathListenersRef,
    activePathRef,
    getDocumentPath,
    subscribeDocumentPath,
  }
}
