import { useCallback, useState } from 'react'

const COMMAND_SEARCH_HISTORY_KEY = 'marklab.command.searchHistory'
const MAX_SEARCH_HISTORY = 8
const MIN_SEARCH_HISTORY_LENGTH = 2

const normalizeSearchTerm = (value: string) => value.trim().replace(/\s+/g, ' ')

const readSearchHistory = () => {
  if (typeof window === 'undefined') return []

  try {
    const rawHistory = window.localStorage.getItem(COMMAND_SEARCH_HISTORY_KEY)
    if (!rawHistory) return []

    const parsedHistory = JSON.parse(rawHistory)
    if (!Array.isArray(parsedHistory)) return []

    return parsedHistory
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeSearchTerm)
      .filter((item) => item.length >= MIN_SEARCH_HISTORY_LENGTH)
      .slice(0, MAX_SEARCH_HISTORY)
  } catch {
    return []
  }
}

const writeSearchHistory = (history: string[]) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(COMMAND_SEARCH_HISTORY_KEY, JSON.stringify(history))
  } catch {
    // Search history is an enhancement only. Ignore unavailable storage.
  }
}

export const useCommandSearchHistory = () => {
  const [searches, setSearches] = useState<string[]>(readSearchHistory)

  const rememberSearch = useCallback((value: string) => {
    const nextSearch = normalizeSearchTerm(value)
    if (nextSearch.length < MIN_SEARCH_HISTORY_LENGTH) return

    setSearches((currentSearches) => {
      const nextSearches = [
        nextSearch,
        ...currentSearches.filter(
          (item) => item.toLocaleLowerCase() !== nextSearch.toLocaleLowerCase(),
        ),
      ].slice(0, MAX_SEARCH_HISTORY)

      writeSearchHistory(nextSearches)
      return nextSearches
    })
  }, [])

  const clearSearchHistory = useCallback(() => {
    setSearches([])

    if (typeof window === 'undefined') return
    try {
      window.localStorage.removeItem(COMMAND_SEARCH_HISTORY_KEY)
    } catch {
      // Search history is optional.
    }
  }, [])

  return {
    searches,
    rememberSearch,
    clearSearchHistory,
  }
}
