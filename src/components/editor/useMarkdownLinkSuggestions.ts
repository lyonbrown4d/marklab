import { useEffect, useRef, useState } from 'react'

import {
  createMarkdownLinkCompletionSession,
  createMarkdownLinkSessionUri,
  type MarkdownLinkCompletionClient,
  type MarkdownLinkSuggestion,
} from '@/components/editor/markdownLinkCompletionSession'

type UseMarkdownLinkSuggestionsOptions = {
  activePath: string | null
  client?: MarkdownLinkCompletionClient
  enabled: boolean
  query: string
}

const COMPLETION_DEBOUNCE_MS = 80

export const useMarkdownLinkSuggestions = ({
  activePath,
  client,
  enabled,
  query,
}: UseMarkdownLinkSuggestionsOptions): MarkdownLinkSuggestion[] => {
  const sessionRef = useRef<ReturnType<typeof createMarkdownLinkCompletionSession> | null>(null)
  const requestRef = useRef(0)
  const [result, setResult] = useState<{
    activePath: string | null
    client: MarkdownLinkCompletionClient
    query: string
    suggestions: MarkdownLinkSuggestion[]
  } | null>(null)

  useEffect(() => {
    requestRef.current += 1
    if (!client || !enabled) return
    const session = createMarkdownLinkCompletionSession({
      client,
      path: activePath,
      uri: createMarkdownLinkSessionUri(),
    })
    sessionRef.current = session
    return () => {
      requestRef.current += 1
      sessionRef.current = null
      void session.close().catch((error: unknown) => {
        console.warn('Failed to close Markdown link completion session', error)
      })
    }
  }, [activePath, client, enabled])

  useEffect(() => {
    const session = sessionRef.current
    if (!session || !client || !enabled) return
    const request = ++requestRef.current
    const timer = window.setTimeout(() => {
      void session
        .complete(query)
        .then((next) => {
          if (requestRef.current === request) {
            setResult({ activePath, client, query, suggestions: next })
          }
        })
        .catch((error: unknown) => {
          if (requestRef.current !== request) return
          setResult({ activePath, client, query, suggestions: [] })
          console.warn('Failed to load Markdown link suggestions', error)
        })
    }, COMPLETION_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [activePath, client, enabled, query])

  if (
    !enabled ||
    !client ||
    result?.activePath !== activePath ||
    result.client !== client ||
    result.query !== query
  ) {
    return []
  }
  return result.suggestions
}
