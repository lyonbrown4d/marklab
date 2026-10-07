import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { parseCommandSearchScope } from '@/components/command/commandSearchScope'
import type { CommandDialogMode } from '@/components/command/CommandSearchOverview'
import { useCommandSearchHistory } from '@/components/command/useCommandSearchHistory'
import { useCommandFullTextSearchStream } from '@/components/command/useCommandFullTextSearchStream'
import type { FsSearchResult } from '@/services/fsApi'

type UseCommandDialogControllerOptions = {
  contentReady: boolean
  onOpenFile: (path: string) => void
  onOpenHeading: (path: string, slug: string) => void
  onOpenSearchResult: (result: FsSearchResult) => void
  open: boolean
  workspaceKey: string
}

const modeByShortcut: Record<string, CommandDialogMode> = {
  '1': 'quick-open',
  '2': 'full-text',
  '3': 'commands',
}

const normalizeModeQuery = (value: string) => value.trim().replace(/^[@#?>]\s*/, '')

export const useCommandDialogController = ({
  contentReady,
  onOpenFile,
  onOpenHeading,
  onOpenSearchResult,
  open,
  workspaceKey,
}: UseCommandDialogControllerOptions) => {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<CommandDialogMode>('quick-open')
  const inputRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)
  const parsedSearch = useMemo(() => parseCommandSearchScope(query), [query])
  const deferredParsedSearch = useMemo(
    () => parseCommandSearchScope(deferredQuery),
    [deferredQuery],
  )
  const trimmedQuery = parsedSearch.query
  const deferredTrimmedQuery = deferredParsedSearch.query
  const searching = trimmedQuery.length > 0 || parsedSearch.scope !== 'all'
  const { searches, rememberSearch, clearSearchHistory } = useCommandSearchHistory()
  const fullTextSearch = useCommandFullTextSearchStream({
    limit: 8,
    open: contentReady && mode === 'full-text' && deferredTrimmedQuery.length >= 2,
    query: deferredTrimmedQuery,
    scope: 'text',
    workspaceKey,
  })

  useEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [open])

  const handleSelectMode = useCallback((nextMode: CommandDialogMode) => {
    setMode(nextMode)
    setQuery(normalizeModeQuery)
    inputRef.current?.focus()
  }, [])

  const handleSelectQuery = useCallback((nextQuery: string) => {
    setMode(nextQuery.trimStart().startsWith('?') ? 'full-text' : 'quick-open')
    setQuery(nextQuery)
    inputRef.current?.focus()
  }, [])

  const handleQueryChange = useCallback((nextQuery: string) => {
    setQuery(nextQuery)
    const marker = nextQuery.trimStart()[0]
    if (marker === '?') setMode('full-text')
    if (marker === '>') setMode('commands')
    if (marker === '@' || marker === '#') setMode('quick-open')
  }, [])

  const handleInputKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      const nextMode = modeByShortcut[event.key]
      if ((event.ctrlKey || event.metaKey) && nextMode) {
        event.preventDefault()
        handleSelectMode(nextMode)
      }
    },
    [handleSelectMode],
  )

  const historyQuery =
    mode === 'full-text' && deferredTrimmedQuery
      ? `? ${deferredTrimmedQuery}`
      : deferredTrimmedQuery

  const rememberAndOpenFile = useCallback(
    (path: string) => {
      rememberSearch(historyQuery)
      onOpenFile(path)
    },
    [historyQuery, onOpenFile, rememberSearch],
  )
  const rememberAndOpenHeading = useCallback(
    (path: string, slug: string) => {
      rememberSearch(historyQuery)
      onOpenHeading(path, slug)
    },
    [historyQuery, onOpenHeading, rememberSearch],
  )
  const rememberAndOpenSearchResult = useCallback(
    (result: FsSearchResult) => {
      rememberSearch(historyQuery)
      onOpenSearchResult(result)
    },
    [historyQuery, onOpenSearchResult, rememberSearch],
  )
  const returnToQuickOpen = useCallback(() => {
    setMode('quick-open')
    setQuery('')
    inputRef.current?.focus()
  }, [])
  const clearQuery = useCallback(() => {
    setQuery('')
    inputRef.current?.focus()
  }, [])

  return {
    clearQuery,
    clearSearchHistory,
    deferredParsedSearch,
    deferredQuery,
    deferredTrimmedQuery,
    fullTextSearch,
    handleInputKeyDown,
    handleQueryChange,
    handleSelectMode,
    handleSelectQuery,
    inputRef,
    mode,
    parsedSearch,
    query,
    rememberAndOpenFile,
    rememberAndOpenHeading,
    rememberAndOpenSearchResult,
    returnToQuickOpen,
    searches,
    searching,
    trimmedQuery,
  }
}
