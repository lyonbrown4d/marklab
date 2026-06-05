import { useEffect, useMemo, useState } from 'react'
import {
  EMPTY_MARKDOWN_TEXT_ANALYSIS,
  type MarkdownTextAnalysisResult,
} from '@/logic/markdownTextAnalysis'
import { analyzeMarkdownText } from '@/services/markdownTextAnalysisWorkerClient'

type MarkdownTextAnalysisState = {
  content: string
  error: string | null
  result: MarkdownTextAnalysisResult
  sourceKey: string
}

export const useMarkdownTextAnalysis = (content: string, enabled: boolean, sourceKey: string) => {
  const [state, setState] = useState<MarkdownTextAnalysisState>({
    content,
    error: null,
    result: EMPTY_MARKDOWN_TEXT_ANALYSIS,
    sourceKey,
  })

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    void analyzeMarkdownText(content)
      .then((result) => {
        if (cancelled) return
        setState({
          content,
          error: null,
          result,
          sourceKey,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setState({
          content,
          error: error instanceof Error ? error.message : 'Markdown text analysis failed.',
          result: EMPTY_MARKDOWN_TEXT_ANALYSIS,
          sourceKey,
        })
      })

    return () => {
      cancelled = true
    }
  }, [content, enabled, sourceKey])

  return useMemo(() => {
    if (!enabled || state.sourceKey !== sourceKey) {
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
  }, [content, enabled, sourceKey, state])
}
