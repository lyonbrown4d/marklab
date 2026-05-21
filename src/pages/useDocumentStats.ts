import { useEffect, useState } from 'react'
export type DocumentStats = {
  characters: number
  lines: number
  words: number
}
const EMPTY_DOCUMENT_STATS: DocumentStats = {
  characters: 0,
  lines: 0,
  words: 0,
}
type IdleWindow = Window & {
  cancelIdleCallback?: (handle: number) => void
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number
}
const getDocumentStats = (value: string): DocumentStats => {
  const trimmed = value.trim()
  return {
    lines: value.length === 0 ? 0 : value.split(/\r\n|\r|\n/).length,
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).filter(Boolean).length,
    characters: value.replace(/\s/g, '').length,
  }
}
const scheduleIdleStatsUpdate = (callback: () => void) => {
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 700 })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }
  const timer = window.setTimeout(callback, 120)
  return () => window.clearTimeout(timer)
}
export const useDocumentStats = (value: string, enabled = true) => {
  const [stats, setStats] = useState<DocumentStats>(EMPTY_DOCUMENT_STATS)
  useEffect(() => {
    if (!enabled) return
    return scheduleIdleStatsUpdate(() => {
      setStats(getDocumentStats(value))
    })
  }, [enabled, value])
  return stats
}
