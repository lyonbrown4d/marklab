import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_MARKDOWN_TEXT_ANALYSIS,
  type MarkdownTextAnalysisResult,
} from '@/logic/markdownTextAnalysis'
import { analyzeMarkdownText } from '@/services/markdownTextAnalysisWorkerClient'

type MarkdownTextAnalysisState = {
  content: string | null
  error: string | null
  result: MarkdownTextAnalysisResult
  sourceKey: string
  includeOutline: boolean
}

export const useMarkdownTextAnalysis = (
  content: string,
  enabled: boolean,
  sourceKey: string,
  includeOutline = true,
) => {
  const [state, setState] = useState<MarkdownTextAnalysisState>({
    content: null,
    error: null,
    result: EMPTY_MARKDOWN_TEXT_ANALYSIS,
    sourceKey,
    includeOutline,
  })

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()

    const timer = window.setTimeout(() => {
      void analyzeMarkdownText(content, { includeOutline, signal: controller.signal })
        .then((result) => {
          if (controller.signal.aborted) return
          setState({
            content,
            error: null,
            result,
            sourceKey,
            includeOutline,
          })
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          setState({
            content,
            error: error instanceof Error ? error.message : 'Markdown text analysis failed.',
            result: EMPTY_MARKDOWN_TEXT_ANALYSIS,
            sourceKey,
            includeOutline,
          })
        })
    }, 250)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [content, enabled, includeOutline, sourceKey])

  return useMemo(() => {
    if (!enabled || state.sourceKey !== sourceKey || state.includeOutline !== includeOutline) {
      return {
        error: null,
        isLoading: enabled,
        ...EMPTY_MARKDOWN_TEXT_ANALYSIS,
      }
    }

    return {
      error: state.error,
      isLoading: state.content !== content,
      ...state.result,
    }
  }, [content, enabled, includeOutline, sourceKey, state])
}
