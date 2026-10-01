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
const STATS_UPDATE_DELAY_MS = 700

export const scheduleIdleStatsUpdate = (callback: () => void) => {
  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    let completed = false
    let idleHandle: number | null = null
    let fallbackHandle: number | null = null
    const cancel = () => {
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
      if (fallbackHandle !== null) window.clearTimeout(fallbackHandle)
    }
    const run = () => {
      if (completed) return
      completed = true
      cancel()
      callback()
    }
    idleHandle = idleWindow.requestIdleCallback(run, { timeout: STATS_UPDATE_DELAY_MS })
    if (completed) idleWindow.cancelIdleCallback(idleHandle)
    else fallbackHandle = window.setTimeout(run, STATS_UPDATE_DELAY_MS)
    return () => {
      completed = true
      cancel()
    }
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
