import { useCallback, useLayoutEffect, useRef, useState } from 'react'

const HISTORY_LIMIT = 100

export const useMindmapHistory = (
  markdown: string,
  onChange: (value: string) => void,
  enabled: boolean,
) => {
  const presentRef = useRef(markdown)
  const undoRef = useRef<string[]>([])
  const redoRef = useRef<string[]>([])
  const [availability, setAvailability] = useState({ canRedo: false, canUndo: false })
  const refresh = useCallback(
    () =>
      setAvailability({
        canRedo: redoRef.current.length > 0,
        canUndo: undoRef.current.length > 0,
      }),
    [],
  )

  useLayoutEffect(() => {
    if (markdown === presentRef.current) return
    presentRef.current = markdown
    undoRef.current = []
    redoRef.current = []
    refresh()
  }, [markdown, refresh])

  const commit = useCallback(
    (nextMarkdown: string) => {
      if (nextMarkdown === presentRef.current) return false
      if (enabled) {
        undoRef.current = [...undoRef.current.slice(-(HISTORY_LIMIT - 1)), presentRef.current]
        redoRef.current = []
      }
      presentRef.current = nextMarkdown
      onChange(nextMarkdown)
      refresh()
      return true
    },
    [enabled, onChange, refresh],
  )

  const undo = useCallback(() => {
    const previous = undoRef.current.pop()
    if (previous === undefined) return false
    redoRef.current.push(presentRef.current)
    presentRef.current = previous
    onChange(previous)
    refresh()
    return true
  }, [onChange, refresh])

  const redo = useCallback(() => {
    const next = redoRef.current.pop()
    if (next === undefined) return false
    undoRef.current.push(presentRef.current)
    presentRef.current = next
    onChange(next)
    refresh()
    return true
  }, [onChange, refresh])

  return {
    ...availability,
    commit,
    getCurrentMarkdown: () => presentRef.current,
    redo,
    undo,
  }
}
