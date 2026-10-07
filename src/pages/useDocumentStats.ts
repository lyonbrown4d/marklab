import { useEffect, useState } from 'react'
import { analyzeDocumentStatsInWorker } from '@/services/markdownTextAnalysisWorkerClient'
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
const DOCUMENT_STATS_DEBOUNCE_MS = 250

export const useDocumentStats = (value: string, enabled = true) => {
  const [stats, setStats] = useState<DocumentStats>(EMPTY_DOCUMENT_STATS)
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    let cancelled = false
    const timer = window.setTimeout(() => {
      void analyzeDocumentStatsInWorker(value, controller.signal).then(
        (nextStats) => {
          if (!cancelled) setStats(nextStats)
        },
        () => {
          if (!cancelled) setStats(EMPTY_DOCUMENT_STATS)
        },
      )
    }, DOCUMENT_STATS_DEBOUNCE_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, value])
  return stats
}
