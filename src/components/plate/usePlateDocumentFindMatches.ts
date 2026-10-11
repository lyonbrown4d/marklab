import { useEffect, useMemo, useState } from 'react'
import type { PlateEditor } from 'platejs/react'
import {
  collectPlateDocumentFindMatches,
  collectPlateDocumentFindSource,
  materializePlateDocumentFindMatches,
  type PlateDocumentFindError,
  type PlateDocumentFindMatch,
  type PlateDocumentFindOptions,
} from '@/components/plate/plateDocumentFindModel'
import { PlateDocumentFindWorkerClient } from '@/services/plateDocumentFindWorkerClient'

type RegexScanState = {
  error: PlateDocumentFindError | 'scanFailed' | null
  key: string
  matches: PlateDocumentFindMatch[]
}

const idleState: RegexScanState = { error: null, key: '', matches: [] }
const WORKER_IDLE_RELEASE_MS = 300

export const usePlateDocumentFindMatches = (
  editor: PlateEditor,
  query: string,
  options: PlateDocumentFindOptions,
  valueVersion: number | null,
  active: boolean,
  clientOverride?: PlateDocumentFindWorkerClient,
) => {
  const [client] = useState(() => clientOverride ?? new PlateDocumentFindWorkerClient())
  const [regexState, setRegexState] = useState<RegexScanState>(idleState)
  const requestKey = `${valueVersion}:${query}:${options.matchCase}:${options.wholeWord}`
  const shouldScanRegex = active && options.useRegex && Boolean(query)
  const literalMatches = useMemo(() => {
    void valueVersion
    return active && !options.useRegex
      ? collectPlateDocumentFindMatches(editor, query, options)
      : []
  }, [active, editor, options, query, valueVersion])
  const source = useMemo(() => {
    void valueVersion
    return shouldScanRegex ? collectPlateDocumentFindSource(editor) : []
  }, [editor, shouldScanRegex, valueVersion])

  useEffect(() => () => client.terminate(), [client])
  useEffect(() => {
    if (shouldScanRegex) return
    const timer = window.setTimeout(() => client.terminate(), WORKER_IDLE_RELEASE_MS)
    return () => window.clearTimeout(timer)
  }, [client, shouldScanRegex])
  useEffect(() => {
    if (!shouldScanRegex) return
    const controller = new AbortController()
    void client
      .scan(
        {
          options: { ...options, useRegex: true },
          query,
          source,
        },
        controller.signal,
      )
      .then((matches) => {
        if (controller.signal.aborted) return
        setRegexState({
          error: null,
          key: requestKey,
          matches: materializePlateDocumentFindMatches(matches),
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRegexState({
          error:
            error instanceof Error && error.message === 'invalidRegex'
              ? 'invalidRegex'
              : 'scanFailed',
          key: requestKey,
          matches: [],
        })
      })
    return () => controller.abort()
  }, [client, options, query, requestKey, shouldScanRegex, source])

  if (!active || !options.useRegex) {
    return { computing: false, error: null, matches: literalMatches }
  }
  if (!query) {
    return { computing: false, error: null, matches: [] }
  }
  const stateIsCurrent = regexState.key === requestKey
  return {
    computing: !stateIsCurrent,
    error: stateIsCurrent ? regexState.error : null,
    matches: stateIsCurrent ? regexState.matches : [],
  }
}
